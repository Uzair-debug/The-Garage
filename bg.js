(function () {

  // ─── Canvas ──────────────────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.id = 'bg-canvas';
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:1;pointer-events:none;';
  document.body.prepend(canvas);

  document.querySelectorAll('body > *:not(#bg-canvas)').forEach(el => {
    el.style.position = el.style.position || 'relative';
    el.style.zIndex = el.style.zIndex || '2';
  });

  const ctx = canvas.getContext('2d');
  let W, H;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    drawStatic();
  }

  // ─── Static layer ────────────────────────────────────────────────
  let staticCanvas, sCtx;

  function drawStatic() {
    staticCanvas = document.createElement('canvas');
    staticCanvas.width = W;
    staticCanvas.height = H;
    sCtx = staticCanvas.getContext('2d');

    drawGrid(sCtx);
    drawSpeedometer(sCtx);
    drawCarSilhouette(sCtx);
  }

  function drawGrid(c) {
    const step = 60;
    c.strokeStyle = 'rgba(255,255,255,0.025)';
    c.lineWidth = 1;
    for (let x = 0; x < W; x += step) {
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
    }
    for (let y = 0; y < H; y += step) {
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }

    // Perspective floor lines (bottom third)
    c.strokeStyle = 'rgba(255,255,255,0.04)';
    const floorY = H * 0.72;
    const vp = { x: W / 2, y: floorY };
    const lineCount = 20;
    for (let i = -lineCount; i <= lineCount; i++) {
      const startX = vp.x + i * (W / lineCount);
      c.beginPath();
      c.moveTo(startX, H);
      c.lineTo(vp.x, vp.y);
      c.stroke();
    }
    for (let y = floorY; y <= H; y += 40) {
      const t = (y - floorY) / (H - floorY);
      c.globalAlpha = 0.03 + t * 0.04;
      c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
    }
    c.globalAlpha = 1;
  }

  function drawSpeedometer(c) {
    const cx = W * 0.82;
    const cy = H * 0.28;
    const r = Math.min(W, H) * 0.22;

    c.save();
    c.strokeStyle = 'rgba(230,48,48,0.06)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.stroke();

    c.strokeStyle = 'rgba(230,48,48,0.04)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
    c.stroke();

    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const isMajor = i % 4 === 0;
      const inner = isMajor ? r * 0.85 : r * 0.9;
      c.strokeStyle = isMajor ? 'rgba(230,48,48,0.12)' : 'rgba(255,255,255,0.05)';
      c.lineWidth = isMajor ? 2 : 1;
      c.beginPath();
      c.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      c.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      c.stroke();
    }

    c.strokeStyle = 'rgba(230,48,48,0.08)';
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(cx, cy, r * 0.6, Math.PI * 0.75, Math.PI * 1.9);
    c.stroke();

    c.restore();
  }

  function drawCarSilhouette(c) {
    const sx = W * 0.04;
    const sy = H * 0.52;
    const scaleX = W * 0.0013;
    const scaleY = scaleX;

    c.save();
    c.translate(sx, sy);
    c.scale(scaleX, scaleY);
    c.fillStyle = 'rgba(255,255,255,0.025)';
    c.strokeStyle = 'rgba(255,255,255,0.04)';
    c.lineWidth = 1 / scaleX;

    c.beginPath();
    c.moveTo(80, 80);
    c.lineTo(110, 30);
    c.lineTo(210, 20);
    c.lineTo(270, 80);
    c.lineTo(310, 80);
    c.lineTo(320, 95);
    c.lineTo(320, 108);
    c.quadraticCurveTo(290, 130, 258, 130);
    c.quadraticCurveTo(226, 130, 220, 108);
    c.lineTo(110, 108);
    c.quadraticCurveTo(104, 130, 72, 130);
    c.quadraticCurveTo(40, 130, 34, 108);
    c.lineTo(20, 108);
    c.lineTo(10, 95);
    c.lineTo(10, 85);
    c.lineTo(40, 80);
    c.closePath();
    c.fill();
    c.stroke();

    c.beginPath();
    c.arc(72, 120, 22, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.03)';
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.05)';
    c.stroke();

    c.beginPath();
    c.arc(258, 120, 22, 0, Math.PI * 2);
    c.fill();
    c.stroke();

    c.beginPath();
    c.moveTo(115, 75);
    c.lineTo(130, 38);
    c.lineTo(205, 30);
    c.lineTo(255, 75);
    c.closePath();
    c.fillStyle = 'rgba(230,48,48,0.04)';
    c.fill();

    c.restore();
  }

  // ─── Animated particles (sparks / embers) ────────────────────────
  const PARTICLE_COUNT = 55;
  const sparks = Array.from({ length: PARTICLE_COUNT }, () => spawnSpark(true));

  function spawnSpark(randomY) {
    return {
      x: Math.random() * W,
      y: randomY ? Math.random() * H : H + 5,
      vx: (Math.random() - 0.5) * 0.6,
      vy: -(Math.random() * 0.8 + 0.2),
      r: Math.random() * 1.8 + 0.4,
      baseAlpha: Math.random() * 0.35 + 0.08,
      life: Math.random(),
      decay: Math.random() * 0.003 + 0.001,
      red: Math.random() > 0.45,
    };
  }

  // ─── Speed lines ─────────────────────────────────────────────────
  let speedLines = [];
  let nextSweep = 0;

  function triggerSweep() {
    const y = Math.random() * H * 0.6 + H * 0.1;
    const height = Math.random() * 3 + 1;
    speedLines.push({ y, height, x: -W * 0.3, alpha: 0.18 });
  }

  // ─── Main loop ───────────────────────────────────────────────────
  function animate(ts) {
    requestAnimationFrame(animate);
    ctx.clearRect(0, 0, W, H);
    if (staticCanvas) ctx.drawImage(staticCanvas, 0, 0);

    sparks.forEach((s, i) => {
      s.x += s.vx;
      s.y += s.vy;
      s.life -= s.decay;
      s.vx += (Math.random() - 0.5) * 0.02;
      if (s.life <= 0 || s.y < -10) {
        sparks[i] = spawnSpark(false);
        sparks[i].x = Math.random() * W;
        return;
      }
      const alpha = s.baseAlpha * s.life;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.red
        ? `rgba(230,${48 + (Math.random() * 30 | 0)},${30 + (Math.random() * 20 | 0)},${alpha})`
        : `rgba(255,${200 + (Math.random() * 50 | 0)},${100 + (Math.random() * 80 | 0)},${alpha})`;
      ctx.fill();
    });

    if (ts - nextSweep > 3500 + Math.random() * 4000) {
      triggerSweep();
      nextSweep = ts;
    }

    speedLines = speedLines.filter(l => {
      l.x += W * 0.04;
      l.alpha *= 0.97;
      if (l.alpha < 0.005 || l.x > W * 1.2) return false;
      const grad = ctx.createLinearGradient(l.x, 0, l.x + W * 0.35, 0);
      grad.addColorStop(0, `rgba(230,48,48,0)`);
      grad.addColorStop(0.2, `rgba(230,48,48,${l.alpha})`);
      grad.addColorStop(0.8, `rgba(230,48,48,${l.alpha * 0.6})`);
      grad.addColorStop(1, `rgba(230,48,48,0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(l.x, l.y - l.height / 2, W * 0.35, l.height);
      return true;
    });
  }

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(animate);
})();
