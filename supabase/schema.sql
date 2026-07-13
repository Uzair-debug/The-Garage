-- The Garage — Supabase schema (project: the-garage / fwxxuhyjuujdimqlyfys)
-- Reconstructed from the live database on 2026-07-08.

-- ============================================================
-- TABLES
-- ============================================================

create table public.cars (
  id          text primary key,
  year        text,
  make        text,
  model       text,
  engine      text,
  power       text,
  drivetrain  text,
  colour      text,
  owner       text,
  photos      jsonb default '[]'::jsonb,
  mods        jsonb default '[]'::jsonb,
  updated_at  bigint,
  status      text,
  instagram   text,
  likes       integer default 0,
  user_id     uuid references auth.users(id),
  zero_to_sixty text, -- free text, e.g. "4.2s" (2026-07-13)
  quarter_mile  text, -- free text, e.g. "12.8s @ 108mph"
  dyno_power    text  -- free text, e.g. "412whp / 380wtq"
);

create table public.profiles (
  id          uuid primary key references auth.users(id),
  email       text,
  created_at  timestamptz default now()
);

create table public.callout_requests (
  id               uuid primary key default gen_random_uuid(),
  car_id           text references public.cars(id),
  owner_id         uuid,
  requester_id     uuid references auth.users(id),
  requester_email  text,
  message          text,
  read             boolean default false,
  created_at       timestamptz default now(),
  response         text,
  response_at      timestamptz,
  requester_unread boolean default false,
  rejected         boolean default false
);

create table public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid references auth.users(id),
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.cars enable row level security;
alter table public.profiles enable row level security;
alter table public.callout_requests enable row level security;
alter table public.push_subscriptions enable row level security;

-- cars
create policy "Public read" on public.cars
  for select using (true);

create policy "Owner insert" on public.cars
  for insert with check (auth.uid() = user_id);

create policy "Owner update" on public.cars
  for update using (auth.uid() = user_id);

create policy "Owner delete" on public.cars
  for delete using (auth.uid() = user_id);

create policy "owner or admin can update" on public.cars
  for update to authenticated
  using (auth.uid() = user_id or (auth.jwt() ->> 'email') = 'mogamaduzair@gmail.com');

create policy "owner or admin can delete" on public.cars
  for delete to authenticated
  using (auth.uid() = user_id or (auth.jwt() ->> 'email') = 'mogamaduzair@gmail.com');

-- profiles
create policy "admin can view profiles" on public.profiles
  for select to authenticated
  using ((auth.jwt() ->> 'email') = 'mogamaduzair@gmail.com');

-- callout_requests
create policy "insert own callout" on public.callout_requests
  for insert to authenticated
  with check (
    requester_id = auth.uid()
    and exists (select 1 from public.cars where cars.user_id = auth.uid())
  );

create policy "owner reads callouts" on public.callout_requests
  for select to authenticated
  using (owner_id = auth.uid() or (auth.jwt() ->> 'email') = 'mogamaduzair@gmail.com');

create policy "owner updates callouts" on public.callout_requests
  for update to authenticated
  using (owner_id = auth.uid() or (auth.jwt() ->> 'email') = 'mogamaduzair@gmail.com');

create policy "requester reads own" on public.callout_requests
  for select to authenticated
  using (requester_id = auth.uid());

create policy "requester updates own" on public.callout_requests
  for update to authenticated
  using (requester_id = auth.uid());

-- push_subscriptions
create policy "manage own subs" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- FUNCTIONS
-- ============================================================

create or replace function public.increment_likes(car_id text)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update cars set likes = coalesce(likes, 0) + 1 where id = car_id;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.profiles (id, email, created_at)
  values (new.id, new.email, new.created_at)
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.handle_new_callout()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
begin
  new.owner_id := (select user_id from public.cars where id = new.car_id);
  new.requester_email := (select email from auth.users where id = new.requester_id);
  return new;
end;
$$;

-- ============================================================
-- TRIGGERS
-- ============================================================

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger on_callout_created
  before insert on public.callout_requests
  for each row execute function public.handle_new_callout();

-- "callout-push" webhook trigger (created via Supabase Dashboard > Database Webhooks):
-- after insert or update on public.callout_requests, POSTs to the send-push
-- edge function at https://fwxxuhyjuujdimqlyfys.supabase.co/functions/v1/send-push
-- with a service-role Authorization header. (Token redacted — recreate via Dashboard.)

-- ============================================================
-- SECURITY HARDENING (2026-07-08)
-- ============================================================

-- Trigger functions are not callable via the REST API.
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.handle_new_callout() from anon, authenticated, public;

-- car-photos is a public bucket served by direct URL; listing is disabled
-- (the broad "public read car photos" SELECT policy on storage.objects was dropped).


-- ============================================================
-- ACCOUNT-BASED REPS (2026-07-09)
-- ============================================================

create table public.car_likes (
  car_id     text not null references public.cars(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (car_id, user_id)
);

alter table public.car_likes enable row level security;
create policy "public read likes" on public.car_likes for select using (true);
create policy "like as self" on public.car_likes for insert to authenticated with check (user_id = auth.uid());
create policy "unlike own" on public.car_likes for delete to authenticated using (user_id = auth.uid());

-- Trigger keeps cars.likes in sync; legacy counts remain as baseline.
-- bump_likes() +1 on insert / -1 on delete; execute revoked from API roles.
-- increment_likes() RPC execute revoked (was anonymously callable).


-- ============================================================
-- MEMBER CARDS + COMMENT NOTIFICATIONS (2026-07-10)
-- ============================================================

create table public.member_cards (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 40),
  bio          text check (bio is null or char_length(bio) <= 300),
  avatar       text,
  updated_at   timestamptz default now()
);
-- RLS: public read; insert/update own row only. Emails stay private in `profiles`.

-- car_comments.owner_id (filled by handle_new_comment() before-insert trigger)
-- powers push + realtime notifications to the car's owner.
-- "comment-push" webhook trigger posts to the send-push edge function (v8+),
-- and car_comments was added to the supabase_realtime publication.


-- ============================================================
-- COMMENTS + BUILD TIMELINE (2026-07-09)
-- ============================================================

create table public.car_comments (
  id         uuid primary key default gen_random_uuid(),
  car_id     text not null references public.cars(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  author     text,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz default now()
);
-- RLS: public read; insert as self; delete by author, the car's owner, or admin.

create table public.car_updates (
  id         uuid primary key default gen_random_uuid(),
  car_id     text not null references public.cars(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 120),
  body       text check (body is null or char_length(body) <= 1000),
  photo      text,
  created_at timestamptz default now()
);
-- RLS: public read; only the car's owner may post; delete by author or admin.


-- ============================================================
-- PERFORMANCE STATS (2026-07-13)
-- ============================================================

-- cars.zero_to_sixty / quarter_mile / dyno_power (all nullable text,
-- see the cars table above). No RLS change needed — covered by the
-- existing public-read / owner-write policies on public.cars.

-- increment_likes(text) has been dropped (replaced by car_likes + trigger).
