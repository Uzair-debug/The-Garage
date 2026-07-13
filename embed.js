/* The Garage — embeddable build card.
 * Usage: <script src="https://ourgarage.pages.dev/embed.js" data-car="CAR_ID" async></script>
 * Drop that tag anywhere (Instagram bio link page, forum post, personal
 * site) and it renders a small self-contained card linking back to the
 * build on The Garage. No iframe, no external CSS/fonts required.
 */
(function () {
  var SUPABASE_URL = 'https://fwxxuhyjuujdimqlyfys.supabase.co';
  var ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3eHh1aHlqdXVqZGltcWx5ZnlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTMyNzAsImV4cCI6MjA5Nzc4OTI3MH0.AVots0cQi-_g6buANdaXAsZrWD0_LAiDVvZbI1USqaQ';
  var SITE = 'https://ourgarage.pages.dev';

  var scripts = document.getElementsByTagName('script');
  var el = document.currentScript || scripts[scripts.length - 1];
  var carId = el && el.getAttribute('data-car');
  if (!carId || !el.parentNode) return;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var mount = document.createElement('div');
  mount.style.cssText = 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;max-width:340px;';
  mount.innerHTML = '<div style="border:1px solid rgba(255,255,255,0.08);border-radius:12px;background:#16161a;color:#888;padding:14px 16px;font-size:13px;line-height:1.4">Loading build…</div>';
  el.parentNode.insertBefore(mount, el);

  fetch(SUPABASE_URL + '/rest/v1/cars?id=eq.' + encodeURIComponent(carId) +
    '&select=year,make,model,owner,photos,likes,mods,status', {
    headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY },
  })
    .then(function (r) { return r.json(); })
    .then(function (rows) {
      var car = rows && rows[0];
      if (!car) { mount.innerHTML = ''; return; }
      var name = [car.year, car.make, car.model].filter(Boolean).join(' ') || 'A build';
      var photo = (car.photos && car.photos[0]) || '';
      var modCount = (car.mods && car.mods.length) || 0;
      var link = SITE + '/car.html?id=' + encodeURIComponent(carId);

      mount.innerHTML =
        '<a href="' + esc(link) + '" target="_blank" rel="noopener" ' +
        'style="display:block;text-decoration:none;border:1px solid rgba(255,255,255,0.08);' +
        'border-radius:12px;overflow:hidden;background:#16161a;color:#f0f0f0">' +
          (photo
            ? '<div style="width:100%;height:150px;background:#1e1e24 url(\'' + esc(photo) + '\') center/cover no-repeat"></div>'
            : '') +
          '<div style="padding:12px 14px">' +
            '<div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#e63030;margin-bottom:4px">The Garage</div>' +
            '<div style="font-size:15px;font-weight:700;margin-bottom:2px">' + esc(name) + '</div>' +
            (car.owner ? '<div style="font-size:12px;color:#888;margin-bottom:8px">' + esc(car.owner) + '</div>' : '') +
            '<div style="display:flex;gap:10px;font-size:12px;color:#888">' +
              '<span>&#10084; ' + (car.likes || 0) + '</span>' +
              (modCount ? '<span>' + modCount + ' mod' + (modCount === 1 ? '' : 's') + '</span>' : '') +
              (car.status ? '<span>' + esc(car.status) + '</span>' : '') +
            '</div>' +
          '</div>' +
        '</a>';
    })
    .catch(function () { mount.innerHTML = ''; });
})();
