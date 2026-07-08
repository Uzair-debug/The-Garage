const SUPABASE_URL = 'https://fwxxuhyjuujdimqlyfys.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3eHh1aHlqdXVqZGltcWx5ZnlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTMyNzAsImV4cCI6MjA5Nzc4OTI3MH0.AVots0cQi-_g6buANdaXAsZrWD0_LAiDVvZbI1USqaQ';

let _sb;
function sb() {
  if (!_sb) _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return _sb;
}

// Columns needed for the home grid — avoids pulling full photo arrays we don't show.
const LIST_COLUMNS = 'id,year,make,model,engine,owner,user_id,status,likes,mods,photos,updated_at';

async function getCars() {
  const { data, error } = await sb().from('cars').select(LIST_COLUMNS).order('updated_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data || [];
}

async function getCar(id) {
  const { data, error } = await sb().from('cars').select('*').eq('id', id).single();
  if (error) return null;
  return data;
}

async function getCarsByUser(userId) {
  const { data, error } = await sb().from('cars').select(LIST_COLUMNS).eq('user_id', userId).order('updated_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data || [];
}

async function upsertCar(car) {
  const { error } = await sb().from('cars').upsert(car);
  if (error) throw error;
}

async function deleteCar(id) {
  const { error } = await sb().from('cars').delete().eq('id', id);
  if (error) throw error;
}

// ─── Callout requests ─────────────────────────────────────────────
// Requester sends a callout for a car; owner_id + requester_email are
// filled server-side by a trigger, so we only pass car_id + message.
async function createCallout(carId, message) {
  const { data: { user } } = await sb().auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { error } = await sb().from('callout_requests').insert({
    car_id: carId,
    requester_id: user.id,
    message: (message || '').trim() || null,
  });
  if (error) throw error;
}

// Requests for cars I own. Filter by owner_id explicitly so the admin
// read-override doesn't surface other people's callouts on my own page.
async function getMyCallouts() {
  const { data: { user } } = await sb().auth.getUser();
  if (!user) return [];
  const { data, error } = await sb()
    .from('callout_requests')
    .select('id,car_id,requester_email,message,read,response,rejected,created_at,car:cars(make,model)')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data || [];
}

// Does this user own at least one car? (gate for requesting callouts)
async function userHasCar(userId) {
  const { data, error } = await sb().from('cars').select('id').eq('user_id', userId).limit(1);
  if (error) { console.error(error); return false; }
  return (data || []).length > 0;
}

async function getUnreadCalloutCount() {
  const { data: { user } } = await sb().auth.getUser();
  if (!user) return 0;
  const { count, error } = await sb()
    .from('callout_requests')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id)
    .eq('read', false);
  if (error) return 0;
  return count || 0;
}

async function markCalloutsRead(ids) {
  if (!ids || !ids.length) return;
  await sb().from('callout_requests').update({ read: true }).in('id', ids);
}

// Owner replies to a callout; flags it unread for the requester.
async function respondToCallout(id, text) {
  const msg = (text || '').trim();
  if (!msg) throw new Error('Empty response');
  const { error } = await sb().from('callout_requests').update({
    response: msg,
    response_at: new Date().toISOString(),
    requester_unread: true,
  }).eq('id', id);
  if (error) throw error;
}

// Owner declines a callout; flags it unread for the requester.
async function rejectCallout(id) {
  const { error } = await sb().from('callout_requests').update({
    rejected: true,
    response_at: new Date().toISOString(),
    requester_unread: true,
  }).eq('id', id);
  if (error) throw error;
}

// Callouts *I* sent (to see owners' responses).
async function getMySentCallouts() {
  const { data: { user } } = await sb().auth.getUser();
  if (!user) return [];
  const { data, error } = await sb()
    .from('callout_requests')
    .select('id,car_id,response,response_at,rejected,requester_unread,created_at,car:cars(make,model)')
    .eq('requester_id', user.id)
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return []; }
  return data || [];
}

// Unread responses to my sent callouts (owner replied, I haven't looked).
async function getResponseUnreadCount() {
  const { data: { user } } = await sb().auth.getUser();
  if (!user) return 0;
  const { count, error } = await sb()
    .from('callout_requests')
    .select('id', { count: 'exact', head: true })
    .eq('requester_id', user.id)
    .eq('requester_unread', true);
  if (error) return 0;
  return count || 0;
}

async function markResponsesRead(ids) {
  if (!ids || !ids.length) return;
  await sb().from('callout_requests').update({ requester_unread: false }).in('id', ids);
}

// Admin-only: list registered members (RLS restricts this to the admin).
async function getProfiles() {
  const { data, error } = await sb()
    .from('profiles')
    .select('id,email,created_at')
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return null; }
  return data || [];
}

async function likeCar(id) {
  const liked = getLiked();
  if (liked.has(id)) return false;
  const { error } = await sb().rpc('increment_likes', { car_id: id });
  if (error) {
    // fallback: manual increment
    const car = await getCar(id);
    if (car) await sb().from('cars').update({ likes: (car.likes || 0) + 1 }).eq('id', id);
  }
  liked.add(id);
  localStorage.setItem('garage_liked', JSON.stringify([...liked]));
  return true;
}

function getLiked() {
  try { return new Set(JSON.parse(localStorage.getItem('garage_liked')) || []); }
  catch { return new Set(); }
}

function hasLiked(id) { return getLiked().has(id); }

function generateId() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    (Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
}

// ─── Escape user-entered text before injecting into HTML ──────────
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Photo handling: compress client-side, upload to Storage ──────
const PHOTO_BUCKET = 'car-photos';
const MAX_PHOTO_DIM = 1600; // px, longest edge

// Decode a File honouring its EXIF orientation, downscale, and re-encode
// to a JPEG Blob. Using createImageBitmap with imageOrientation:'from-image'
// bakes the correct rotation in, so phone photos no longer show sideways.
async function compressImage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    // Older engines: decode without orientation handling rather than failing.
    bitmap = await createImageBitmap(file);
  }

  let { width, height } = bitmap;
  const scale = Math.min(1, MAX_PHOTO_DIM / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  if (bitmap.close) bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Compression failed')),
      'image/jpeg',
      0.82
    );
  });
}

// Compress + upload a File to Storage; returns the public URL.
async function uploadPhoto(file) {
  const blob = await compressImage(file);
  const path = `${generateId()}.jpg`;
  const { error } = await sb().storage.from(PHOTO_BUCKET).upload(path, blob, {
    contentType: 'image/jpeg',
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  const { data } = sb().storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ─── Scroll progress line under the nav (all pages) ──────────────
(function () {
  if (document.getElementById('scroll-progress')) return;
  const bar = document.createElement('div');
  bar.id = 'scroll-progress';
  document.body.appendChild(bar);
  const upd = () => {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? Math.min(1, window.scrollY / h) : 0})`;
  };
  window.addEventListener('scroll', upd, { passive: true });
  window.addEventListener('resize', upd, { passive: true });
  upd();
})();

function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function carIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M5 17h-2v-6l2 -5h9l4 4h1a2 2 0 0 1 2 2v5h-2m-4 0h-6m-6 -6h15m-6 0v-5"/></svg>`;
}

const STATUS_META = {
  'Daily Driver': { color: '#639922', bg: '#63992222' },
  'Track Build':  { color: '#e63030', bg: '#e6303022' },
  'Project Car':  { color: '#ef9f27', bg: '#ef9f2722' },
  'Stored':       { color: '#888780', bg: '#88878022' },
};

// Mod category colours (shared by car.html + add.html)
const CAT_COLORS = {
  Engine:'#e63030', Exhaust:'#ef9f27', Suspension:'#378add',
  Exterior:'#1d9e75', Wheels:'#7f77dd', Interior:'#639922',
  Brakes:'#d85a30', Audio:'#d4537e', Other:'#888780'
};

function normalizeMod(m) { return typeof m === 'string' ? { cat: 'Other', name: m } : m; }

// Small decorative icons per mod category / spec
const CAT_ICONS = {
  Engine: '<path d="M13 3l-6 9h4l-2 9 8-11h-5z"/>',
  Exhaust: '<path d="M4 8h8a2 2 0 1 0 -2 -3"/><path d="M3 12h12a2 2 0 1 1 -2 3"/><path d="M4 16h6a2 2 0 1 1 -2 3"/>',
  Suspension: '<path d="M8 4l8 2.5l-8 3l8 3l-8 3l8 2.5"/>',
  Exterior: '<path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M5 17h-2v-6l2 -5h9l4 4h1a2 2 0 0 1 2 2v5h-2m-4 0h-6m-6 -6h15m-6 0v-5"/>',
  Wheels: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M12 4.5v5"/><path d="M12 14.5v5"/><path d="M4.5 12h5"/><path d="M14.5 12h5"/>',
  Interior: '<path d="M5 11a2 2 0 0 1 2 2v1h10v-1a2 2 0 1 1 4 0v4a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2z"/><path d="M6 11v-5a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v5"/>',
  Brakes: '<circle cx="12" cy="12" r="5"/><path d="M12 3a9 9 0 0 1 9 9"/><path d="M3 12a9 9 0 0 1 9 -9"/>',
  Audio: '<path d="M11 5l-4 4h-3v6h3l4 4z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
  Colour: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1 -12 0c0 -4.5 6 -11 6 -11z"/>',
  Other: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
};

function catIcon(cat, size = 14) {
  const path = CAT_ICONS[cat] || CAT_ICONS.Other;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

function fmtDate(iso, withYear = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  const opts = { month: 'short', day: 'numeric' };
  if (withYear) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// ─── Shared car-card renderer (home grid + profile grid) ──────────
function renderCarCard(car, { showOwner = true } = {}) {
  const img = car.photos && car.photos.length
    ? `<img class="car-card-img" src="${encodeURI(car.photos[0])}" alt="${escapeHtml(car.model)}" loading="lazy">`
    : `<div class="car-card-img-placeholder">${carIcon()}</div>`;

  const statusMeta = STATUS_META[car.status];
  const statusChip = statusMeta
    ? `<span class="car-chip" style="background:${statusMeta.bg};color:${statusMeta.color};border:1px solid ${statusMeta.color}55">${escapeHtml(car.status)}</span>` : '';

  const modCount = car.mods?.length
    ? `<span class="badge badge-red">${car.mods.length} mod${car.mods.length > 1 ? 's' : ''}</span>` : '';
  const engine = car.engine ? `<span class="badge">${escapeHtml(car.engine)}</span>` : '';
  const power = car.power ? `<span class="badge">${escapeHtml(car.power)}</span>` : '';

  const liked = hasLiked(car.id);
  const likeBtn = `
    <button class="like-btn ${liked ? 'liked' : ''}" onclick="event.stopPropagation();handleCardLike(this,'${car.id}')" title="Rep this build">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572"/></svg>
      <span>${car.likes || 0}</span>
    </button>`;

  const ownerLine = showOwner
    ? `<div class="car-card-sub">${car.owner && car.user_id
        ? `<a class="owner-link" href="profile.html?id=${car.user_id}" onclick="event.stopPropagation()">${escapeHtml(car.owner)}</a>`
        : car.owner ? escapeHtml(car.owner) : '&nbsp;'}</div>`
    : '';

  const multiPhoto = car.photos && car.photos.length > 1;
  const photosAttr = multiPhoto
    ? ` data-photos="${encodeURIComponent(JSON.stringify(car.photos.map(p => encodeURI(p))))}"`
    : '';
  const dotsHtml = multiPhoto
    ? `<div class="car-dots">${car.photos.map((_, i) => `<span class="car-dot ${i === 0 ? 'active' : ''}"></span>`).join('')}</div>`
    : '';

  const go = `location.href='car.html?id=${car.id}'`;
  return `
    <div class="car-card" role="button" tabindex="0" onclick="${go}"
         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${go}}">
      <div class="car-card-media"${photosAttr}>
        ${img}
        ${statusChip}
        ${dotsHtml}
        <span class="car-card-arrow" aria-hidden="true">→</span>
      </div>
      <div class="car-card-body">
        <div class="car-card-header">
          <div>
            <div class="car-card-title">${car.year ? escapeHtml(car.year) + ' ' : ''}${escapeHtml(car.make || '')} ${escapeHtml(car.model || 'Unnamed Car')}</div>
            ${ownerLine}
          </div>
          ${likeBtn}
        </div>
        <div class="car-card-badges">${engine}${power}${modCount}</div>
      </div>
    </div>`;
}

// ─── Card extras: scroll reveal, photo carousel, hover tilt ───────
// Call after rendering a .car-grid (index + profile do this).
function initCardExtras(root) {
  const scope = root || document;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cards = [...scope.querySelectorAll('.car-card:not(.in)')];

  // Reveal cards as they scroll into view (staggered)
  if (!('IntersectionObserver' in window) || reduce) {
    cards.forEach(c => c.classList.add('in'));
  } else {
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -30px' });
    cards.forEach((c, i) => {
      c.style.animationDelay = `${Math.min((i % 8) * 45, 320)}ms`;
      io.observe(c);
    });
  }

  cards.forEach(card => {
    // Photo carousel (hover on desktop, swipe on touch)
    const media = card.querySelector('.car-card-media[data-photos]');
    if (media) {
      let photos = [];
      try { photos = JSON.parse(decodeURIComponent(media.dataset.photos)); } catch (e) {}
      const img = media.querySelector('.car-card-img');
      const dots = media.querySelectorAll('.car-dot');
      if (img && photos.length > 1) {
        let idx = 0, timer = null, swiped = false;
        const show = i => {
          idx = (i + photos.length) % photos.length;
          img.src = photos[idx];
          dots.forEach((d, j) => d.classList.toggle('active', j === idx));
        };
        card.addEventListener('mouseenter', () => {
          if (reduce || timer) return;
          timer = setInterval(() => show(idx + 1), 1100);
        });
        card.addEventListener('mouseleave', () => {
          clearInterval(timer); timer = null; show(0);
        });
        let sx = 0, sy = 0;
        media.addEventListener('touchstart', e => {
          sx = e.touches[0].clientX; sy = e.touches[0].clientY; swiped = false;
        }, { passive: true });
        media.addEventListener('touchend', e => {
          const dx = e.changedTouches[0].clientX - sx;
          const dy = e.changedTouches[0].clientY - sy;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            show(idx + (dx < 0 ? 1 : -1));
            swiped = true;
            e.preventDefault(); // keep the swipe from counting as a card tap
          }
        }, { passive: false });
        card.addEventListener('click', e => {
          if (swiped) { e.stopImmediatePropagation(); e.preventDefault(); swiped = false; }
        }, true);
      }
    }

    // Subtle 3D tilt (pointer devices only)
    if (!reduce && matchMedia('(hover: hover)').matches) {
      card.addEventListener('mousemove', e => {
        const r = card.getBoundingClientRect();
        const rx = ((e.clientY - r.top) / r.height - 0.5) * -4;
        const ry = ((e.clientX - r.left) / r.width - 0.5) * 4;
        card.style.transform = `perspective(700px) translateY(-3px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      });
      card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    }
  });
}

async function handleCardLike(btn, id) {
  if (hasLiked(id)) return;
  const success = await likeCar(id);
  if (!success) return;
  const span = btn.querySelector('span');
  span.textContent = parseInt(span.textContent) + 1;
  btn.classList.add('liked');
  btn.querySelector('svg').setAttribute('fill', 'currentColor');
  if (typeof allCars !== 'undefined') {
    const car = allCars.find(c => c.id === id);
    if (car) car.likes = (car.likes || 0) + 1;
  }
}
