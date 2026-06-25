const SUPABASE_URL = 'https://fwxxuhyjuujdimqlyfys.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3eHh1aHlqdXVqZGltcWx5ZnlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTMyNzAsImV4cCI6MjA5Nzc4OTI3MH0.AVots0cQi-_g6buANdaXAsZrWD0_LAiDVvZbI1USqaQ';

let _sb;
function sb() {
  if (!_sb) _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return _sb;
}

// Columns needed for the home grid — avoids pulling full photo arrays we don't show.
const LIST_COLUMNS = 'id,year,make,model,engine,owner,status,likes,mods,photos,updated_at';

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
