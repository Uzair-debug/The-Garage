// ─── Auth state ──────────────────────────────────────────────────
const ADMIN_EMAIL = 'mogamaduzair@gmail.com';

let _currentUser = null;

function isAdmin(user) {
  return !!user && user.email === ADMIN_EMAIL;
}

async function getCurrentUser() {
  const { data: { user } } = await sb().auth.getUser();
  _currentUser = user;
  return user;
}

// ─── Nav injection ───────────────────────────────────────────────
async function initAuth() {
  const user = await getCurrentUser();
  renderNavAuth(user);
  if (user) setupCalloutNotifications();

  sb().auth.onAuthStateChange((_event, session) => {
    _currentUser = session?.user || null;
    renderNavAuth(_currentUser);
  });
}

// Pop-up notifications for callouts on my cars (on-load + live realtime)
let _calloutChannel = null;
async function setupCalloutNotifications() {
  if (!_currentUser) return;
  const onCalloutsPage = location.pathname.endsWith('callouts.html');

  // Surface existing unread on load
  if (!onCalloutsPage) {
    const [incoming, responses] = await Promise.all([
      getUnreadCalloutCount(), getResponseUnreadCount(),
    ]);
    if (incoming > 0) showCalloutPopup(`${incoming} new callout${incoming > 1 ? 's' : ''}`, 'Tap to view your requests');
    if (responses > 0) showCalloutPopup(`${responses} new repl${responses > 1 ? 'ies' : 'y'}`, 'An owner replied to your callout');
  }

  // Live updates while the page is open
  if (_calloutChannel) return;
  _calloutChannel = sb()
    .channel('callouts-' + _currentUser.id)
    // New requests on cars I own
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'callout_requests',
      filter: 'owner_id=eq.' + _currentUser.id,
    }, payload => {
      const who = payload.new?.requester_email || 'Someone';
      showCalloutPopup('New callout request', who + ' wants a callout');
      updateCalloutBadge();
    })
    // Owner replied to a callout I sent
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'callout_requests',
      filter: 'requester_id=eq.' + _currentUser.id,
    }, payload => {
      const repliedNow = payload.new?.response && payload.new.response !== payload.old?.response;
      const rejectedNow = payload.new?.rejected && !payload.old?.rejected;
      if (repliedNow) {
        showCalloutPopup('Callout reply', 'The owner responded to your callout');
        updateCalloutBadge();
      } else if (rejectedNow) {
        showCalloutPopup('Callout declined', 'The owner declined your callout');
        updateCalloutBadge();
      }
    })
    .subscribe();
}

function showCalloutPopup(title, sub) {
  const el = document.createElement('div');
  el.className = 'callout-popup';
  el.innerHTML = `
    <div class="callout-popup-icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M5 5v16"/><path d="M5 5h11l-2 4l2 4h-11"/></svg>
    </div>
    <div class="callout-popup-text">
      <div class="callout-popup-title">${escapeHtml(title)}</div>
      <div class="callout-popup-sub">${escapeHtml(sub || '')}</div>
    </div>`;
  el.onclick = () => { location.href = 'callouts.html'; };
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 6500);
}

function renderNavAuth(user) {
  let el = document.getElementById('nav-auth');
  if (!el) {
    el = document.createElement('div');
    el.id = 'nav-auth';
    el.style.cssText = 'display:flex;align-items:center;gap:8px;margin-left:8px';
    const actions = document.querySelector('.nav-actions');
    if (actions) actions.prepend(el);
  }

  if (user) {
    const initial = (user.email[0] || '?').toUpperCase();
    const adminItem = isAdmin(user)
      ? `<a class="user-menu-item" href="admin.html">Members</a>`
      : '';
    el.innerHTML = `
      <div class="user-menu">
        <button class="user-avatar" onclick="toggleUserMenu(event)" title="${escapeHtml(user.email)}" aria-label="Account menu">${escapeHtml(initial)}<span class="avatar-dot" id="avatar-dot"></span></button>
        <div class="user-menu-panel" id="user-menu-panel">
          <div class="user-menu-email">${escapeHtml(user.email)}</div>
          <a class="user-menu-item" href="callouts.html">Callouts <span class="menu-count" id="callout-badge"></span></a>
          <button class="user-menu-item" id="push-toggle" onclick="handlePushToggle()">Enable notifications</button>
          ${adminItem}
          <button class="user-menu-item danger" onclick="signOut()">Sign out</button>
        </div>
      </div>`;
    updateCalloutBadge();
    refreshPushToggle();
  } else {
    el.innerHTML = `
      <button class="btn" onclick="showAuthModal()" style="font-size:0.78rem;padding:0.35rem 0.8rem">Sign in</button>`;
  }
}

// ─── User menu dropdown ──────────────────────────────────────────
function toggleUserMenu(e) {
  e.stopPropagation();
  const panel = document.getElementById('user-menu-panel');
  if (!panel) return;
  const open = panel.classList.toggle('open');
  if (open) {
    setTimeout(() => document.addEventListener('click', closeUserMenu), 0);
    document.addEventListener('keydown', _userMenuEsc);
  }
}
function closeUserMenu() {
  const panel = document.getElementById('user-menu-panel');
  if (panel) panel.classList.remove('open');
  document.removeEventListener('click', closeUserMenu);
  document.removeEventListener('keydown', _userMenuEsc);
}
function _userMenuEsc(e) { if (e.key === 'Escape') closeUserMenu(); }

// Reflect push state in the dropdown toggle
async function refreshPushToggle() {
  const btn = document.getElementById('push-toggle');
  if (!btn || typeof isPushEnabled !== 'function') return;
  if (!pushSupported()) { btn.textContent = 'Notifications unsupported'; btn.disabled = true; return; }
  btn.textContent = (await isPushEnabled()) ? 'Notifications on ✓' : 'Enable notifications';
}

async function handlePushToggle() {
  if (typeof enablePush !== 'function') return;
  const ok = await enablePush();
  if (ok) refreshPushToggle();
}

// Unread callout indicator on the avatar + dropdown
async function updateCalloutBadge() {
  if (!_currentUser) return;
  let n = 0;
  try {
    const [incoming, responses] = await Promise.all([
      getUnreadCalloutCount(),
      getResponseUnreadCount(),
    ]);
    n = incoming + responses;
  } catch (e) {}
  const dot = document.getElementById('avatar-dot');
  const badge = document.getElementById('callout-badge');
  if (dot) dot.style.display = n > 0 ? 'block' : 'none';
  if (badge) badge.textContent = n > 0 ? n : '';
}

// ─── Sign out ────────────────────────────────────────────────────
async function signOut() {
  await sb().auth.signOut();
  location.href = 'index.html';
}

// ─── Auth modal ──────────────────────────────────────────────────
function showAuthModal(onSuccess, onCancel) {
  if (document.getElementById('auth-modal-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'auth-modal-overlay';
  overlay.className = 'auth-overlay';
  overlay.innerHTML = `
    <div class="auth-modal">
      <button class="auth-close" onclick="closeAuthModal()" title="Close">×</button>
      <div class="auth-logo">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M5 17h-2v-6l2 -5h9l4 4h1a2 2 0 0 1 2 2v5h-2m-4 0h-6m-6 -6h15m-6 0v-5"/></svg>
        The Garage
      </div>
      <h2 class="auth-title" id="auth-title">Welcome back</h2>
      <p class="auth-sub" id="auth-sub">Sign in to manage your builds.</p>

      <div class="auth-form">
        <div class="field">
          <label>Email</label>
          <input type="email" id="auth-email" placeholder="you@example.com" autocomplete="email">
        </div>
        <div class="field">
          <label>Password</label>
          <input type="password" id="auth-password" placeholder="••••••••" autocomplete="current-password">
        </div>
        <p class="auth-error" id="auth-error"></p>
        <button class="btn btn-primary" id="auth-submit" onclick="submitAuth()" style="width:100%;justify-content:center;margin-top:4px">
          Sign in
        </button>
      </div>

      <p class="auth-toggle">
        Don't have an account?
        <button onclick="toggleAuthMode()">Sign up</button>
      </p>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeAuthModal(); });
  document.getElementById('auth-email').focus();

  // Enter key submits
  overlay.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });
  });

  overlay._onSuccess = onSuccess;
  overlay._onCancel = onCancel;
}

function closeAuthModal() {
  const el = document.getElementById('auth-modal-overlay');
  if (!el) return;
  const cancelled = !el._success;
  const onCancel = el._onCancel;
  el.remove();
  if (cancelled && typeof onCancel === 'function') onCancel();
}

let _authMode = 'signin';

function toggleAuthMode() {
  _authMode = _authMode === 'signin' ? 'signup' : 'signin';
  const isSignup = _authMode === 'signup';
  document.getElementById('auth-title').textContent = isSignup ? 'Create account' : 'Welcome back';
  document.getElementById('auth-sub').textContent = isSignup ? 'Join the garage.' : 'Sign in to manage your builds.';
  document.getElementById('auth-submit').textContent = isSignup ? 'Sign up' : 'Sign in';
  document.getElementById('auth-password').autocomplete = isSignup ? 'new-password' : 'current-password';
  document.querySelector('.auth-toggle').innerHTML = isSignup
    ? `Already have an account? <button onclick="toggleAuthMode()">Sign in</button>`
    : `Don't have an account? <button onclick="toggleAuthMode()">Sign up</button>`;
  document.getElementById('auth-error').textContent = '';
}

async function submitAuth() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  const btn = document.getElementById('auth-submit');

  if (!email || !password) { errEl.textContent = 'Please fill in both fields.'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }

  btn.textContent = 'Please wait…';
  btn.disabled = true;
  errEl.textContent = '';

  const { data, error } = _authMode === 'signup'
    ? await sb().auth.signUp({ email, password })
    : await sb().auth.signInWithPassword({ email, password });

  if (error) {
    errEl.textContent = error.message;
    btn.textContent = _authMode === 'signup' ? 'Sign up' : 'Sign in';
    btn.disabled = false;
    return;
  }

  _currentUser = data.user;
  const overlay = document.getElementById('auth-modal-overlay');
  const cb = overlay?._onSuccess;
  if (overlay) overlay._success = true; // prevents the cancel callback firing
  closeAuthModal();
  renderNavAuth(_currentUser);
  if (cb) cb(_currentUser);
}

// ─── Guard: redirect to modal if not logged in ───────────────────
async function requireAuth(onAuthed, onCancel) {
  const user = await getCurrentUser();
  if (user) { onAuthed(user); return; }
  showAuthModal(onAuthed, onCancel);
}
