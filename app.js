const SUPABASE_URL = 'https://fwxxuhyjuujdimqlyfys.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3eHh1aHlqdXVqZGltcWx5ZnlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTMyNzAsImV4cCI6MjA5Nzc4OTI3MH0.AVots0cQi-_g6buANdaXAsZrWD0_LAiDVvZbI1USqaQ';

let _sb;
function sb() {
  if (!_sb) _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return _sb;
}

async function getCars() {
  const { data, error } = await sb().from('cars').select('*').order('updated_at', { ascending: false });
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
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
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
