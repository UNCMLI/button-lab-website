// Mucus gel — heterogeneous thick blue layer with height-field physics + particle ecosystem
// + metaball blob layer with specular highlights and gooey SVG filter.
// Mouse plows the gel; particles and blobs drift continuously and are disturbed by mouse motion.
// No external libraries.
(function () {
  if (window.__mucusInstalled) return;
  window.__mucusInstalled = true;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- DOM ----------
  const stage = document.createElement('div');
  stage.id = 'mucus-stage';
  stage.setAttribute('aria-hidden', 'true');
  stage.innerHTML = `
    <svg width="0" height="0" style="position:absolute;">
      <defs>
        <filter id="mucus-goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation="18" result="blur" />
          <feColorMatrix in="blur" mode="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 28 -13" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    </svg>
    <canvas id="mucus-canvas"></canvas>
    <canvas id="mucus-blobs"></canvas>
    <canvas id="mucus-spec"></canvas>
    <canvas id="mucus-particles"></canvas>
    <div class="mucus-gloss"></div>
  `;

  const css = document.createElement('style');
  css.textContent = `
    html, body { background: transparent !important; }
    #mucus-stage {
      position: fixed; inset: 0; z-index: -2;
      pointer-events: none; overflow: hidden;
      background: #b8d3e3;
    }
    #mucus-canvas {
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      filter: blur(6px) saturate(1.08);
    }
    #mucus-blobs {
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      filter: url(#mucus-goo);
      mix-blend-mode: multiply;
      opacity: 0.72;
    }
    #mucus-spec {
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      mix-blend-mode: screen;
      opacity: 0.82;
    }
    #mucus-particles {
      position: absolute; inset: 0;
      width: 100%; height: 100%;
      pointer-events: none;
    }
    #mucus-stage .mucus-gloss {
      position: absolute; inset: 0;
      pointer-events: none;
      background:
        radial-gradient(ellipse 90% 60% at 28% 18%, rgba(255,255,255,0.28), transparent 65%),
        radial-gradient(ellipse 70% 55% at 78% 88%, rgba(255,255,255,0.16), transparent 60%);
      mix-blend-mode: screen;
    }
    .site-header { background: rgba(250, 248, 245, 0.84) !important; }
    .pubs-jump   { background: rgba(250, 248, 245, 0.84) !important; }
    body { background: transparent !important; }
    @media (prefers-reduced-motion: reduce) {
      #mucus-blobs, #mucus-spec { transition: none !important; }
    }
  `;
  document.head.appendChild(css);
  document.body.insertBefore(stage, document.body.firstChild);

  const canvas   = stage.querySelector('#mucus-canvas');
  const ctx      = canvas.getContext('2d');
  const bcanvas  = stage.querySelector('#mucus-blobs');
  const bctx     = bcanvas.getContext('2d');
  const specCvs  = stage.querySelector('#mucus-spec');
  const sctx     = specCvs.getContext('2d');
  const pcanvas  = stage.querySelector('#mucus-particles');
  const pctx     = pcanvas.getContext('2d');

  // ---------- Grid ----------
  const CELL = 7;
  let W = 0, H = 0, COLS = 0, ROWS = 0;
  let height = null, rest = null, imgData = null, temp = null;

  function noise2(x, y) {
    return (
      Math.sin(x * 0.013 + y * 0.011) * 0.55 +
      Math.sin(x * 0.031 - y * 0.027 + 1.7) * 0.30 +
      Math.sin(x * 0.075 + y * 0.061 + 3.3) * 0.18 +
      Math.sin(x * 0.140 - y * 0.120 + 5.1) * 0.10
    );
  }

  const DPR = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    COLS = Math.ceil(W / CELL) + 2;
    ROWS = Math.ceil(H / CELL) + 2;
    canvas.width = COLS;
    canvas.height = ROWS;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    for (const c of [bcanvas, specCvs, pcanvas]) {
      c.width = Math.floor(W * DPR);
      c.height = Math.floor(H * DPR);
      c.style.width = W + 'px';
      c.style.height = H + 'px';
    }
    bctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    sctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    pctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    height  = new Float32Array(COLS * ROWS);
    temp    = new Float32Array(COLS * ROWS);
    rest    = new Float32Array(COLS * ROWS);
    imgData = ctx.createImageData(COLS, ROWS);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        rest[y * COLS + x] = noise2(x, y) * 0.55;
      }
    }
    seedAnchors();
    seedParticles();
  }

  // ---------- Blobs ----------
  const N_BIG  = 16;
  const N_MED  = 28;
  const N_TINY = 32;
  const blobs  = [];

  function randF(a, b) { return a + Math.random() * (b - a); }

  function seedAnchors() {
    blobs.length = 0;
    const seedClusters = 4;
    const clusters = Array.from({ length: seedClusters }, () => ({
      x: randF(W * 0.15, W * 0.85),
      y: randF(H * 0.2,  H * 0.85),
    }));
    function clusterPos(spread) {
      const c = clusters[Math.floor(Math.random() * clusters.length)];
      return { x: c.x + randF(-spread, spread), y: c.y + randF(-spread, spread) };
    }
    for (let i = 0; i < N_BIG; i++) {
      const p = clusterPos(W * 0.28);
      blobs.push(makeBlob(p.x, p.y, randF(95, 165), 'big'));
    }
    for (let i = 0; i < N_MED; i++) {
      const p = clusterPos(W * 0.45);
      blobs.push(makeBlob(p.x, p.y, randF(40, 75), 'med'));
    }
    for (let i = 0; i < N_TINY; i++) {
      blobs.push(makeBlob(randF(0, W), randF(0, H), randF(14, 28), 'tiny'));
    }
  }

  function makeBlob(x, y, r, kind) {
    return {
      x, y,
      ax: x, ay: y,
      vx: 0, vy: 0,
      r, kind,
      phase:       Math.random() * Math.PI * 2,
      breathSpeed: randF(0.0006, 0.0016),
      breathAmp:   r * 0.07,
      tintShift:   randF(-8, 8),
    };
  }

  // ---------- Particles ----------
  const particles = [];
  const N_PARTICLES = 180;

  const PALETTE = [
    [180, 60,  50 ],
    [200, 110, 40 ],
    [70,  110, 60 ],
    [50,  130, 130],
    [90,  70,  140],
    [180, 140, 50 ],
    [120, 80,  70 ],
    [70,  90,  140],
    [40,  120, 90 ],
    [160, 90,  130],
  ];

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr)  { return arr[Math.floor(Math.random() * arr.length)]; }

  function seedParticles() {
    particles.length = 0;
    for (let i = 0; i < N_PARTICLES; i++) {
      const k = Math.random();
      let type;
      if      (k < 0.30) type = 'speck';
      else if (k < 0.45) type = 'rod';
      else if (k < 0.55) type = 'coccus';
      else if (k < 0.62) type = 'diplo';
      else if (k < 0.74) type = 'virus';
      else if (k < 0.80) type = 'phage';
      else if (k < 0.90) type = 'cluster';
      else               type = 'fiber';

      let size;
      if      (type === 'fiber')   size = rand(12, 24);
      else if (type === 'rod')     size = rand(3.6, 6.0);
      else if (type === 'coccus')  size = rand(3.0, 4.8);
      else if (type === 'diplo')   size = rand(2.7, 4.2);
      else if (type === 'virus')   size = rand(3.3, 5.2);
      else if (type === 'phage')   size = rand(3.5, 5.5);
      else if (type === 'cluster') size = rand(4.5, 7.5);
      else                         size = rand(1.8, 3.9);

      particles.push({
        x: rand(0, W), y: rand(0, H),
        vx: rand(-0.15, 0.15), vy: rand(-0.1, 0.1),
        type, size,
        rot:   rand(0, Math.PI * 2),
        rotV:  rand(-0.025, 0.025),
        color: pick(PALETTE),
        accent: pick(PALETTE),
        phase: rand(0, Math.PI * 2),
      });
    }
  }

  // ---------- Mouse ----------
  const mouse = {
    x: -1e4, y: -1e4, px: -1e4, py: -1e4,
    vx: 0, vy: 0, speed: 0,
    smoothVx: 0, smoothVy: 0, inside: false,
  };
  window.addEventListener('mousemove', e => {
    if (!mouse.inside) { mouse.px = e.clientX; mouse.py = e.clientY; }
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true;
  }, { passive: true });
  window.addEventListener('mouseleave', () => { mouse.inside = false; });
  window.addEventListener('touchmove', e => {
    if (e.touches[0]) {
      if (!mouse.inside) { mouse.px = e.touches[0].clientX; mouse.py = e.touches[0].clientY; }
      mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; mouse.inside = true;
    }
  }, { passive: true });
  window.addEventListener('touchend', () => { mouse.inside = false; });

  // ---------- Height-field physics ----------
  const RADIUS_PX = 65, PILE_STRENGTH = 3.2, VALLEY_STRENGTH = 2.6;
  const SIDE_PILE = 1.2, DIFFUSION = 0.16, RELAX = 0.010, AMBIENT_AMP = 0.07;

  function tick(t) {
    if (mouse.inside) {
      const ivx = mouse.x - mouse.px, ivy = mouse.y - mouse.py;
      mouse.vx = ivx; mouse.vy = ivy;
      mouse.smoothVx = mouse.smoothVx * 0.55 + ivx * 0.45;
      mouse.smoothVy = mouse.smoothVy * 0.55 + ivy * 0.45;
    } else {
      mouse.smoothVx *= 0.9; mouse.smoothVy *= 0.9;
    }
    mouse.speed = Math.hypot(mouse.smoothVx, mouse.smoothVy);
    mouse.px = mouse.x; mouse.py = mouse.y;

    if (mouse.inside && mouse.speed > 0.3) {
      const cx = mouse.x / CELL, cy = mouse.y / CELL;
      const radius = RADIUS_PX / CELL, r2 = radius * radius;
      const sp = Math.max(mouse.speed, 0.001);
      const dx = mouse.smoothVx / sp, dy = mouse.smoothVy / sp;
      const speedFactor = Math.min(0.25 + mouse.speed / 18, 2.2);
      const minX = Math.max(1, Math.floor(cx - radius));
      const maxX = Math.min(COLS - 2, Math.ceil(cx + radius));
      const minY = Math.max(1, Math.floor(cy - radius));
      const maxY = Math.min(ROWS - 2, Math.ceil(cy + radius));
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const ox = x - cx, oy = y - cy, d2 = ox * ox + oy * oy;
          if (d2 > r2) continue;
          const dot = (ox * dx + oy * dy) / radius;
          const radial = 1 - d2 / r2;
          let push;
          if (dot > 0) {
            const ridge = Math.exp(-Math.pow((dot - 0.85) * 3.0, 2));
            push = (PILE_STRENGTH * ridge + SIDE_PILE * (1 - Math.abs(dot)) * 0.35) * radial * speedFactor;
          } else {
            const trough = Math.exp(-Math.pow((dot + 0.55) * 2.4, 2));
            push = -(VALLEY_STRENGTH * trough) * radial * speedFactor;
            push += SIDE_PILE * (1 - Math.abs(dot)) * 0.15 * radial * speedFactor;
          }
          height[y * COLS + x] += push * 0.22;
        }
      }
    }

    temp.set(height);
    for (let y = 1; y < ROWS - 1; y++) {
      const row = y * COLS;
      for (let x = 1; x < COLS - 1; x++) {
        const i = row + x;
        const avg = (temp[i - 1] + temp[i + 1] + temp[i - COLS] + temp[i + COLS]) * 0.25;
        height[i] += (avg - temp[i]) * DIFFUSION;
      }
    }

    const ambBase = AMBIENT_AMP * (reduceMotion ? 0 : 1);
    const ta = t * 0.0005, tb = t * 0.00065;
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        const i = y * COLS + x;
        height[i] -= height[i] * RELAX;
        const amb = Math.sin(x * 0.04 + ta) * Math.cos(y * 0.035 + tb) * ambBase
                  + Math.sin(x * 0.09 - tb * 1.3) * Math.cos(y * 0.08 + ta * 1.1) * ambBase * 0.5;
        height[i] += amb * 0.025;
      }
    }
  }

  // ---------- Blob physics ----------
  function tickBlobs() {
    const MOUSE_R  = 110;
    const MOUSE_R2 = MOUSE_R * MOUSE_R;
    const MOUSE_FORCE = 1.6;
    const ANCHOR_K    = 0.018;
    const DAMP        = 0.86;

    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];
      b.vx += (b.ax - b.x) * ANCHOR_K;
      b.vy += (b.ay - b.y) * ANCHOR_K;

      if (mouse.inside) {
        const mdx = b.x - mouse.x, mdy = b.y - mouse.y;
        const d2 = mdx * mdx + mdy * mdy;
        if (d2 < MOUSE_R2 * 4) {
          const d = Math.sqrt(d2) + 0.001;
          const falloff = Math.exp(-d2 / (MOUSE_R2 * 0.75));
          b.vx += (mdx / d) * falloff * MOUSE_FORCE * 8;
          b.vy += (mdy / d) * falloff * MOUSE_FORCE * 8;
          b.vx += mouse.smoothVx * falloff * 0.06;
          b.vy += mouse.smoothVy * falloff * 0.06;
        }
      }

      b.vx *= DAMP;
      b.vy *= DAMP;
      b.x  += b.vx;
      b.y  += b.vy;
    }
  }

  // ---------- Gel render ----------
  const C_VALLEY=[244,250,254], C_THIN=[206,226,240], C_REST=[165,200,224],
        C_THICK=[110,158,195],  C_PILE=[38,92,140];
  function lerp3(a,b,t){return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
  function colorFor(total){
    if (total <= -1.0) return C_VALLEY;
    if (total <= -0.3) return lerp3(C_THIN,  C_VALLEY, (-0.3 - total) / 0.7);
    if (total <=  0.3) return lerp3(C_REST,  C_THIN,   (0.3 - total)  / 0.6);
    if (total <=  1.0) return lerp3(C_REST,  C_THICK,  (total - 0.3)  / 0.7);
    if (total <=  2.0) return lerp3(C_THICK, C_PILE,   (total - 1.0)  / 1.0);
    return C_PILE;
  }
  function drawGel() {
    const data = imgData.data; let p = 0; const len = COLS * ROWS;
    for (let i = 0; i < len; i++) {
      let total = rest[i] + height[i];
      if (total > 2.0) total = 2.0; if (total < -1.5) total = -1.5;
      const col = colorFor(total);
      data[p]=col[0]; data[p+1]=col[1]; data[p+2]=col[2]; data[p+3]=255; p += 4;
    }
    ctx.putImageData(imgData, 0, 0);
  }

  // ---------- Blob render ----------
  function drawBlobs(t) {
    bctx.clearRect(0, 0, W, H);
    sctx.clearRect(0, 0, W, H);

    for (const b of blobs) {
      const breath = 1 + Math.sin(t * b.breathSpeed + b.phase) * 0.05;
      const r = b.r * breath + b.breathAmp * Math.sin(t * b.breathSpeed * 1.7 + b.phase);

      const grad = bctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      if (b.kind === 'big') {
        grad.addColorStop(0,    'rgba(228, 240, 248, 0.98)');
        grad.addColorStop(0.45, 'rgba(180, 213, 234, 0.92)');
        grad.addColorStop(0.85, 'rgba(110, 168, 207, 0.7)');
        grad.addColorStop(1,    'rgba(80,  140, 185, 0.0)');
      } else if (b.kind === 'med') {
        grad.addColorStop(0,    'rgba(210, 230, 244, 0.95)');
        grad.addColorStop(0.6,  'rgba(150, 198, 228, 0.8)');
        grad.addColorStop(1,    'rgba(100, 160, 200, 0.0)');
      } else {
        grad.addColorStop(0,    'rgba(195, 222, 238, 0.85)');
        grad.addColorStop(1,    'rgba(120, 175, 210, 0.0)');
      }

      bctx.fillStyle = grad;
      bctx.beginPath();
      bctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      bctx.fill();

      // Specular highlight
      if (b.kind !== 'tiny') {
        const hx = b.x - r * 0.32;
        const hy = b.y - r * 0.42;
        const hr = r * 0.32;
        const g2 = sctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
        g2.addColorStop(0,   'rgba(255,255,255,0.85)');
        g2.addColorStop(0.4, 'rgba(255,255,255,0.35)');
        g2.addColorStop(1,   'rgba(255,255,255,0.0)');
        sctx.fillStyle = g2;
        sctx.beginPath();
        sctx.arc(hx, hy, hr, 0, Math.PI * 2);
        sctx.fill();
      }
    }
  }

  // ---------- Particle render ----------
  function rgba(c, a)    { return `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`; }
  function darker(c, k)  { return [c[0]*k,           c[1]*k,           c[2]*k          ]; }
  function lighter(c, k) { return [c[0]+(255-c[0])*k, c[1]+(255-c[1])*k, c[2]+(255-c[2])*k]; }

  function drawVirus(p, alpha) {
    const s = p.size;
    const body = p.color, dark = darker(body, 0.55), light = lighter(body, 0.45);
    pctx.strokeStyle = rgba(dark, alpha * 0.8);
    pctx.lineWidth = 0.9;
    const spikes = 10;
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2 + p.phase;
      const x1 = Math.cos(a) * s * 0.95, y1 = Math.sin(a) * s * 0.95;
      const x2 = Math.cos(a) * s * 1.5,  y2 = Math.sin(a) * s * 1.5;
      pctx.beginPath(); pctx.moveTo(x1, y1); pctx.lineTo(x2, y2); pctx.stroke();
      pctx.fillStyle = rgba(body, alpha);
      pctx.beginPath(); pctx.arc(x2, y2, 0.9, 0, Math.PI * 2); pctx.fill();
    }
    pctx.fillStyle = rgba(body, alpha);
    pctx.beginPath(); pctx.arc(0, 0, s * 0.95, 0, Math.PI * 2); pctx.fill();
    pctx.fillStyle = rgba(light, alpha * 0.6);
    pctx.beginPath(); pctx.arc(-s * 0.3, -s * 0.35, s * 0.35, 0, Math.PI * 2); pctx.fill();
    pctx.strokeStyle = rgba(dark, alpha * 0.9);
    pctx.lineWidth = 0.7;
    pctx.beginPath(); pctx.arc(0, 0, s * 0.95, 0, Math.PI * 2); pctx.stroke();
  }

  function drawPhage(p, alpha) {
    const s = p.size;
    const body = p.color, dark = darker(body, 0.55);
    pctx.fillStyle = rgba(body, alpha);
    pctx.strokeStyle = rgba(dark, alpha);
    pctx.lineWidth = 0.7;
    pctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * s * 0.8, y = Math.sin(a) * s * 0.8 - s * 0.6;
      if (i === 0) pctx.moveTo(x, y); else pctx.lineTo(x, y);
    }
    pctx.closePath(); pctx.fill(); pctx.stroke();
    pctx.beginPath();
    pctx.moveTo(-s * 0.25, s * 0.2); pctx.lineTo(-s * 0.25, s * 1.2);
    pctx.lineTo( s * 0.25, s * 1.2); pctx.lineTo( s * 0.25, s * 0.2);
    pctx.closePath(); pctx.fill(); pctx.stroke();
    pctx.beginPath();
    pctx.moveTo(-s * 0.25, s * 1.2); pctx.lineTo(-s * 0.7, s * 1.7);
    pctx.moveTo( s * 0.25, s * 1.2); pctx.lineTo( s * 0.7, s * 1.7);
    pctx.moveTo(0, s * 1.2); pctx.lineTo(0, s * 1.8);
    pctx.stroke();
  }

  function drawCoccus(p, alpha) {
    const s = p.size;
    const body = p.color, dark = darker(body, 0.6), light = lighter(body, 0.4);
    pctx.fillStyle = rgba(body, alpha);
    pctx.beginPath(); pctx.arc(0, 0, s, 0, Math.PI * 2); pctx.fill();
    pctx.strokeStyle = rgba(dark, alpha * 0.8);
    pctx.lineWidth = 0.8;
    pctx.beginPath(); pctx.arc(0, 0, s, 0, Math.PI * 2); pctx.stroke();
    pctx.fillStyle = rgba(light, alpha * 0.55);
    pctx.beginPath(); pctx.arc(-s * 0.3, -s * 0.3, s * 0.3, 0, Math.PI * 2); pctx.fill();
  }

  function drawDiplo(p, alpha) {
    const s = p.size;
    const body = p.color, dark = darker(body, 0.6);
    pctx.fillStyle = rgba(body, alpha);
    pctx.strokeStyle = rgba(dark, alpha * 0.8);
    pctx.lineWidth = 0.7;
    pctx.beginPath(); pctx.arc(-s * 0.85, 0, s, 0, Math.PI * 2); pctx.fill(); pctx.stroke();
    pctx.beginPath(); pctx.arc( s * 0.85, 0, s, 0, Math.PI * 2); pctx.fill(); pctx.stroke();
  }

  function drawRod(p, alpha) {
    const s = p.size;
    const body = p.color, dark = darker(body, 0.6), light = lighter(body, 0.4);
    pctx.fillStyle = rgba(body, alpha);
    pctx.strokeStyle = rgba(dark, alpha * 0.85);
    pctx.lineWidth = 0.7;
    const w = s * 2.0, h = s * 0.75;
    pctx.beginPath();
    pctx.moveTo(-w + h, -h);
    pctx.lineTo( w - h, -h);
    pctx.arc(w - h, 0, h, -Math.PI / 2, Math.PI / 2);
    pctx.lineTo(-w + h, h);
    pctx.arc(-w + h, 0, h, Math.PI / 2, -Math.PI / 2);
    pctx.closePath();
    pctx.fill(); pctx.stroke();
    pctx.fillStyle = rgba(light, alpha * 0.45);
    pctx.beginPath();
    pctx.ellipse(0, -h * 0.3, w * 0.65, h * 0.25, 0, 0, Math.PI * 2);
    pctx.fill();
  }

  function drawCluster(p, alpha) {
    const s = p.size;
    const body = p.color, accent = p.accent;
    pctx.fillStyle = rgba(body, alpha * 0.9);
    pctx.beginPath(); pctx.arc(-s * 0.4, 0, s * 0.55, 0, Math.PI * 2); pctx.fill();
    pctx.fillStyle = rgba(accent, alpha * 0.85);
    pctx.beginPath(); pctx.arc(s * 0.35, s * 0.25, s * 0.5, 0, Math.PI * 2); pctx.fill();
    pctx.fillStyle = rgba(body, alpha * 0.8);
    pctx.beginPath(); pctx.arc(s * 0.05, -s * 0.45, s * 0.42, 0, Math.PI * 2); pctx.fill();
  }

  function drawSpeck(p, alpha) {
    pctx.fillStyle = rgba(p.color, alpha * 0.9);
    pctx.beginPath(); pctx.arc(0, 0, p.size, 0, Math.PI * 2); pctx.fill();
  }

  function drawFiber(p, alpha) {
    pctx.strokeStyle = rgba(p.color, alpha * 0.7);
    pctx.lineWidth = 1.2;
    pctx.beginPath();
    pctx.moveTo(-p.size, 0);
    pctx.quadraticCurveTo(0, p.size * 0.45, p.size, 0);
    pctx.stroke();
  }

  function updateAndDrawParticles(t) {
    pctx.clearRect(0, 0, W, H);
    const mInside = mouse.inside, mx = mouse.x, my = mouse.y;
    const mvx = mouse.smoothVx, mvy = mouse.smoothVy;
    const PR = 70, PR2 = PR * PR;
    const tt = t * 0.0003;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.vx += Math.sin(p.y * 0.005 + tt + p.phase) * 0.008;
      p.vy += Math.cos(p.x * 0.005 + tt * 1.1 + p.phase) * 0.008;
      p.vx += (Math.random() - 0.5) * 0.05;
      p.vy += (Math.random() - 0.5) * 0.05;
      if (mInside) {
        const dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy;
        if (d2 < PR2 * 4) {
          const d = Math.sqrt(d2) + 0.001;
          const fall = Math.exp(-d2 / (PR2 * 0.7));
          p.vx += (dx / d) * fall * 2.4;
          p.vy += (dy / d) * fall * 2.4;
          p.vx += mvx * fall * 0.08;
          p.vy += mvy * fall * 0.08;
        }
      }
      p.vx *= 0.92; p.vy *= 0.92;
      p.x += p.vx; p.y += p.vy;
      p.rot += p.rotV + (p.vx + p.vy) * 0.005;
      if (p.x < -30) p.x = W + 30;
      if (p.x > W + 30) p.x = -30;
      if (p.y < -30) p.y = H + 30;
      if (p.y > H + 30) p.y = -30;

      pctx.save();
      pctx.translate(p.x, p.y);
      pctx.rotate(p.rot);
      const alpha = 0.62 + 0.22 * Math.sin(t * 0.001 + p.phase);
      switch (p.type) {
        case 'speck':   drawSpeck(p, alpha);   break;
        case 'rod':     drawRod(p, alpha);     break;
        case 'coccus':  drawCoccus(p, alpha);  break;
        case 'diplo':   drawDiplo(p, alpha);   break;
        case 'virus':   drawVirus(p, alpha);   break;
        case 'phage':   drawPhage(p, alpha);   break;
        case 'cluster': drawCluster(p, alpha); break;
        case 'fiber':   drawFiber(p, alpha);   break;
      }
      pctx.restore();
    }
  }

  // ---------- Loop ----------
  let raf = 0;
  function loop(t) {
    if (!reduceMotion) {
      tick(t);
      tickBlobs();
    }
    drawGel();
    drawBlobs(t);
    updateAndDrawParticles(t);
    raf = requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  resize();
  raf = requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else raf = requestAnimationFrame(loop);
  });
})();
