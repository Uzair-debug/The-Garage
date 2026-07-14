/* ─────────────────────────────────────────────────────────────────
   The Garage — extra interactive effects
   Custom cursor, magnetic buttons, rev-ring clicks, scroll-reveal,
   compact nav, one-time ignition boot flash, hero word-flip, and a
   cursor-reactive glow on car cards. Additive only — doesn't touch
   the existing canvas background, card tilt or view-transitions.
   Respects prefers-reduced-motion and touch/coarse pointers.
───────────────────────────────────────────────────────────────── */
(function () {
  document.addEventListener('DOMContentLoaded', init);
  if (document.readyState !== 'loading') init();

  let started = false;
  function init() {
    if (started) return;
    started = true;

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hoverCapable = matchMedia('(hover: hover) and (pointer: fine)').matches;

    bootFlash(reduce);
    compactNav();
    igniteHero(reduce);
    scrollReveal(reduce);
    if (!reduce && hoverCapable) {
      customCursor();
      magneticButtons();
      cardGlow();
    }
    revRing(reduce);
  }

  // ─── One-time "ignition" flash on first page of the session ──────
  function bootFlash(reduce) {
    if (reduce) return;
    try {
      if (sessionStorage.getItem('grg_booted')) return;
      sessionStorage.setItem('grg_booted', '1');
    } catch (e) { return; }
    const flash = document.createElement('div');
    flash.className = 'boot-flash';
    document.body.appendChild(flash);
    requestAnimationFrame(() => requestAnimationFrame(() => flash.classList.add('go')));
    setTimeout(() => flash.remove(), 950);
  }

  // ─── Nav shrinks + gains a hairline glow once you scroll ─────────
  function compactNav() {
    const nav = document.querySelector('nav');
    if (!nav) return;
    const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ─── Hero heading: words flip up into place on load ──────────────
  function igniteHero(reduce) {
    if (reduce) return;
    document.querySelectorAll('.hero-bio-text h1').forEach(h1 => {
      if (h1.dataset.ignited) return;
      h1.dataset.ignited = '1';
      const frag = document.createDocumentFragment();
      let wordIdx = 0;
      Array.from(h1.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          node.textContent.split(/(\s+)/).forEach(chunk => {
            if (!chunk) return;
            if (/^\s+$/.test(chunk)) { frag.appendChild(document.createTextNode(chunk)); return; }
            const span = document.createElement('span');
            span.textContent = chunk;
            span.className = 'ignite-word';
            span.style.setProperty('--wd', wordIdx++);
            frag.appendChild(span);
          });
        } else {
          frag.appendChild(node);
        }
      });
      h1.appendChild(frag);
    });
  }

  // ─── Generic scroll-reveal for section titles, cards & rows ──────
  // Also auto-counts-up any leading number in .spec-value / .lb-reps
  // the first time they're revealed (skips ones already animated
  // elsewhere, e.g. the hero stat pills, which have their own logic).
  function scrollReveal(reduce) {
    const sel = 'h2.section-title, .detail-card, .empty-state, .lb-row, ' +
      '.tl-item, .spec-row, .stat-pill, .hero-tag, .hero-bio-text > p, .hero-actions';

    if (!('IntersectionObserver' in window) || reduce) return; // leave everything visible as-is

    const io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        en.target.classList.add('reveal-in');
        io.unobserve(en.target);
        if (en.target.matches('.spec-value, .lb-reps')) animateNumber(en.target);
        en.target.querySelectorAll('.spec-value, .lb-reps').forEach(animateNumber);
      });
    }, { rootMargin: '0px 0px -40px', threshold: 0.05 });

    let queued = false;
    function stage() {
      queued = false;
      const groups = new Map();
      document.querySelectorAll(sel).forEach(el => {
        if (el.classList.contains('reveal-done')) return;
        el.classList.add('reveal-done', 'reveal-item');
        const parent = el.parentElement;
        const idx = groups.get(parent) || 0;
        groups.set(parent, idx + 1);
        el.style.transitionDelay = Math.min(idx, 8) * 45 + 'ms';
        io.observe(el);
      });
    }
    stage();
    const mo = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(stage);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  function animateNumber(el) {
    if (el.dataset.counted) return;
    el.dataset.counted = '1';
    const text = el.textContent;
    const m = text.match(/-?\d[\d,]*\.?\d*/);
    if (!m) return;
    const raw = m[0];
    const target = parseFloat(raw.replace(/,/g, ''));
    if (!isFinite(target)) return;
    const decimals = (raw.split('.')[1] || '').length;
    const before = text.slice(0, m.index);
    const after = text.slice(m.index + raw.length);
    const dur = 700;
    const start = performance.now();
    (function tick(now) {
      const t = Math.min(1, (now - start) / dur);
      const val = target * (1 - Math.pow(1 - t, 3));
      const shown = decimals ? val.toFixed(decimals) : Math.round(val).toLocaleString();
      el.textContent = before + shown + after;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = before + raw + after;
    })(start);
  }

  // ─── Custom cursor: glow dot + lagging ring, grows on hoverables ─
  function customCursor() {
    const dot = document.createElement('div'); dot.className = 'cursor-dot';
    const ring = document.createElement('div'); ring.className = 'cursor-ring';
    document.body.append(dot, ring);
    document.documentElement.classList.add('has-custom-cursor');

    let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
    window.addEventListener('mousemove', e => {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = `translate(${mx}px,${my}px)`;
    }, { passive: true });

    (function loop() {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      ring.style.transform = `translate(${rx}px,${ry}px)`;
      requestAnimationFrame(loop);
    })();

    const hoverSel = 'a, button, .btn, .car-card, input, textarea, select, [role="button"], summary';
    document.addEventListener('mouseover', e => { if (e.target.closest && e.target.closest(hoverSel)) ring.classList.add('hover'); });
    document.addEventListener('mouseout', e => { if (e.target.closest && e.target.closest(hoverSel)) ring.classList.remove('hover'); });
    document.addEventListener('mousedown', () => ring.classList.add('down'));
    document.addEventListener('mouseup', () => ring.classList.remove('down'));
    document.documentElement.addEventListener('mouseleave', () => { dot.style.opacity = 0; ring.style.opacity = 0; });
    document.documentElement.addEventListener('mouseenter', () => { dot.style.opacity = 1; ring.style.opacity = 1; });
  }

  // ─── Magnetic pull for primary buttons ────────────────────────────
  function magneticButtons() {
    document.body.addEventListener('mousemove', e => {
      const btn = e.target.closest && e.target.closest('.btn-primary');
      document.querySelectorAll('.btn-primary.magnet-active').forEach(b => {
        if (b !== btn) { b.style.transform = ''; b.classList.remove('magnet-active'); }
      });
      if (!btn) return;
      btn.classList.add('magnet-active');
      const r = btn.getBoundingClientRect();
      const dx = e.clientX - r.left - r.width / 2;
      const dy = e.clientY - r.top - r.height / 2;
      btn.style.transform = `translate(${(dx * 0.18).toFixed(1)}px, ${(dy * 0.28).toFixed(1)}px)`;
    }, { passive: true });
  }

  // ─── Rev-ring pulse on primary button click ───────────────────────
  function revRing(reduce) {
    document.addEventListener('click', e => {
      const btn = e.target.closest && e.target.closest('.btn-primary');
      if (!btn || reduce) return;
      const r = btn.getBoundingClientRect();
      const ring = document.createElement('span');
      ring.className = 'rev-ring';
      ring.style.left = (e.clientX - r.left) + 'px';
      ring.style.top = (e.clientY - r.top) + 'px';
      btn.appendChild(ring);
      setTimeout(() => ring.remove(), 650);
    });
  }

  // ─── Car card: soft spotlight that follows the cursor ─────────────
  function cardGlow() {
    document.addEventListener('mousemove', e => {
      const card = e.target.closest && e.target.closest('.car-card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    }, { passive: true });
  }
})();
