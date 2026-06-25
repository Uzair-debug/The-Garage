// Web push opt-in. Registers the service worker, subscribes the device,
// and stores the subscription so the Edge Function can push to it.
const VAPID_PUBLIC_KEY = 'BM41g8jAmXYDR0vAzDhvRhdjWT-zVNPhUukeBFbctgX4YO1fkKhK3TrE7M4CjyjO1JDQ85VP7zBjrpnMixy2YQ';

function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function getPushRegistration() {
  return navigator.serviceWorker.register('sw.js');
}

// Already subscribed on this device?
async function isPushEnabled() {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch (e) { return false; }
}

// Turn on notifications for the current device + user.
async function enablePush() {
  if (!pushSupported()) {
    showToast('Notifications aren’t supported on this browser.', 'error');
    return false;
  }
  const { data: { user } } = await sb().auth.getUser();
  if (!user) { showToast('Sign in first to enable notifications.', 'error'); return false; }

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    showToast('Notifications blocked — enable them in your browser settings.', 'error');
    return false;
  }

  try {
    const reg = await getPushRegistration();
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const json = sub.toJSON();
    const { error } = await sb().from('push_subscriptions').upsert({
      endpoint: sub.endpoint,
      user_id: user.id,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    }, { onConflict: 'endpoint' });
    if (error) throw error;
    showToast('Notifications enabled for this device!');
    return true;
  } catch (e) {
    console.error(e);
    showToast('Could not enable notifications — try again.', 'error');
    return false;
  }
}
