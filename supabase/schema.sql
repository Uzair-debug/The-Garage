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
  user_id     uuid references auth.users(id)
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
