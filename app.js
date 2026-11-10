/* Swallowtail, "Infrared". Thermographs drawn from the shared solver (thermal.js). No libraries. */
(() => {
  "use strict";
  const S = window.SwallowThermal;
  if (!S) return;
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TMAX = 60;                       // calibrated scale, kelvin above coolant, shared by every view
  const N = S.N, NN = N * N, L = 4;
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
  const fmt = (k) => k.toFixed(2);
  const HTML = document.documentElement;
  const isDeck = () => HTML.classList.contains("deck");
  const deckScene = { name: "hero" };

  /* ---------- colour map: "steel to ember", built in OKLab, lightness strictly rising ---------- */
  const STOPS = [ // t, L, C, hue(deg)
    [0.00, 0.14, 0.022, 252], [0.16, 0.25, 0.030, 248], [0.30, 0.35, 0.012, 240],
    [0.42, 0.45, 0.105, 32], [0.56, 0.57, 0.160, 38], [0.70, 0.69, 0.165, 52],
    [0.84, 0.82, 0.135, 72], [1.00, 0.97, 0.045, 92],
  ].map(([t, l, c, h]) => [t, l, c * Math.cos(h * Math.PI / 180), c * Math.sin(h * Math.PI / 180)]);
  const lin2s = (x) => { x = Math.max(0, Math.min(1, x)); return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055); };
  function oklab(l, a, b) {
    const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3, m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3, s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [lin2s(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_), lin2s(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_), lin2s(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_)];
  }
  const LUT = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255; let k = 0;
    while (k < STOPS.length - 2 && t > STOPS[k + 1][0]) k++;
    const A = STOPS[k], B = STOPS[k + 1], f = (t - A[0]) / (B[0] - A[0]);
    const c = oklab(A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f, A[3] + (B[3] - A[3]) * f);
    LUT[i * 3] = c[0]; LUT[i * 3 + 1] = c[1]; LUT[i * 3 + 2] = c[2];
  }
  const rgbOf = (k) => { const i = 3 * Math.max(0, Math.min(255, Math.round(k / TMAX * 255))); return `rgb(${LUT[i]},${LUT[i + 1]},${LUT[i + 2]})`; };
  const lumOf = (k) => { const i = 3 * Math.max(0, Math.min(255, Math.round(k / TMAX * 255))); return (0.2126 * LUT[i] + 0.7152 * LUT[i + 1] + 0.0722 * LUT[i + 2]) / 255; };
  {
    const stops = []; for (let i = 0; i <= 12; i++) stops.push(`${rgbOf(i / 12 * TMAX)} ${(i / 12 * 100).toFixed(1)}%`);
    const r = document.documentElement.style;
    r.setProperty("--map", `linear-gradient(90deg, ${stops.join(",")})`);
    r.setProperty("--mapv", `linear-gradient(0deg, ${stops.join(",")})`);
    document.querySelectorAll(".scale-ticks").forEach((el) => {
      for (let k = 0; k <= TMAX; k += 10) { const s = document.createElement("span"); s.style.bottom = (k / TMAX * 100) + "%"; s.textContent = k === TMAX ? k + " K" : k; el.appendChild(s); }
    });
  }

  /* ---------- texture: bilinear-upsample temperatures 4x, then colour (map applied after interpolation) ---------- */
  const UP = 4, TN = N * UP;
  function makeTex() { const c = document.createElement("canvas"); c.width = c.height = TN; const x = c.getContext("2d"); return { c, x, img: x.createImageData(TN, TN) }; }
  function paintTex(tex, T, off) {
    const d = tex.img.data;
    for (let py = 0; py < TN; py++) {
      let fy = (py + 0.5) / UP - 0.5; if (fy < 0) fy = 0; if (fy > N - 1) fy = N - 1;
      const y0 = Math.min(N - 2, fy | 0), wy = fy - y0;
      for (let px = 0; px < TN; px++) {
        let fx = (px + 0.5) / UP - 0.5; if (fx < 0) fx = 0; if (fx > N - 1) fx = N - 1;
        const x0 = Math.min(N - 2, fx | 0), wx = fx - x0, i = off + y0 * N + x0;
        const v = (T[i] * (1 - wx) + T[i + 1] * wx) * (1 - wy) + (T[i + N] * (1 - wx) + T[i + N + 1] * wx) * wy;
        const li = 3 * Math.max(0, Math.min(255, (v / TMAX * 255 + 0.5) | 0)), o = 4 * (py * TN + px);
        d[o] = LUT[li]; d[o + 1] = LUT[li + 1]; d[o + 2] = LUT[li + 2]; d[o + 3] = 255;
      }
    }
    tex.x.putImageData(tex.img, 0, 0);
  }
  function argmax(T, from, to) { let m = -1, mi = from; for (let i = from; i < to; i++) if (T[i] > m) { m = T[i]; mi = i; } return [mi, m]; }

  /* ---------- marching squares isotherms on cell centres ---------- */
  function isoSegments(T, off, level) {
    const segs = [];
    for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) {
      const a = T[off + y * N + x], b = T[off + y * N + x + 1], c = T[off + (y + 1) * N + x + 1], d = T[off + (y + 1) * N + x];
      const idx = (a > level) | ((b > level) << 1) | ((c > level) << 2) | ((d > level) << 3);
      if (idx === 0 || idx === 15) continue;
      const e = [];
      const P = (p, q, vp, vq) => { const f = (level - vp) / (vq - vp); return [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]; };
      const pa = [x, y], pb = [x + 1, y], pc = [x + 1, y + 1], pd = [x, y + 1];
      if ((a > level) !== (b > level)) e.push(P(pa, pb, a, b));
      if ((b > level) !== (c > level)) e.push(P(pb, pc, b, c));
      if ((c > level) !== (d > level)) e.push(P(pc, pd, c, d));
      if ((d > level) !== (a > level)) e.push(P(pd, pa, d, a));
      if (e.length === 2) segs.push(e); else if (e.length === 4) { segs.push([e[0], e[1]]); segs.push([e[2], e[3]]); }
    }
    return segs;
  }

  /* ---------- precomputed reference solves ---------- */
  const NAIVE = S.naiveStack(L);
  const FLAT = S.solve(NAIVE, L, { mode: "flat" });   // 9.23 K
  const STACK = S.solve(NAIVE, L);                     // 54.27 K
  const tierWatts = (lay) => [0, 1, 2, 3].map((t) => lay.slice(t * 16, t * 16 + 16).reduce((s, k) => s + S.TILE_TYPES[k].watts, 0));

  const visible = new Set();
  const io = new IntersectionObserver((es) => { es.forEach((e) => { e.isIntersecting ? visible.add(e.target) : visible.delete(e.target); if (e.isIntersecting && e.target.__onShow) e.target.__onShow(); }); kick(); }, { rootMargin: "80px" });

  /* =====================================================================================
     HERO: the bottom die of the naive stack, solver relaxing into steady state, isotherms
     ===================================================================================== */
  const hero = (() => {
    const cv = document.getElementById("hero-cv"); if (!cv) return null;
    const ctx = cv.getContext("2d"), tex = makeTex();
    let W = 0, H = 0, dpr = 1, T = new Float64Array(L * NN), iter = 0, done = RM, ptr = null, dirty = true;
    if (RM) T = STACK.temps;
    const OFF = 3 * NN;
    function size() { dpr = DPR(); const r = cv.getBoundingClientRect(); W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); dirty = true; }
    function step() {
      if (done) return;
      const r = S.solve(NAIVE, L, { warm: T, maxIter: 3 });
      T = r.temps; iter += r.iters;
      if (r.iters < 3 || iter > 160) { T = STACK.temps; done = true; iter = STACK.iters; }
      dirty = true;
    }
    function draw() {
      if (!dirty) return; dirty = false;
      const c = ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
      paintTex(tex, T, OFF);
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high";
      c.drawImage(tex.c, 0, 0, W, H);
      const sc = W / N, cx = (x) => (x + 0.5) * sc;
      // isotherms every 4 K, labelled every 8 K along the right-going ray from the hot spot
      const [hi, hk] = argmax(T, OFF, OFF + NN);
      const hx = (hi - OFF) % N, hy = ((hi - OFF) / N) | 0;
      c.lineWidth = 1; c.font = `400 ${Math.max(10, W / 62)}px ${MONO}`; c.textBaseline = "middle";
      for (let lv = 4; lv < TMAX; lv += 4) {
        if (lv > hk) break;
        const segs = isoSegments(T, OFF, lv); if (!segs.length) continue;
        c.strokeStyle = lumOf(lv) > 0.55 ? "rgba(10,8,6,0.55)" : "rgba(236,233,227,0.32)";
        c.beginPath(); for (const [p, q] of segs) { c.moveTo(cx(p[0]), cx(p[1])); c.lineTo(cx(q[0]), cx(q[1])); } c.stroke();
        if (lv % 8 === 0) { // label where the contour crosses the hot spot's row, to the right
          let best = null;
          for (const [p, q] of segs) { const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; if (m[0] > hx && Math.abs(m[1] - (hy + 4.5)) < 1.2 && (!best || m[0] < best[0])) best = m; }
          if (best) { const t = lv + " K", w = c.measureText(t).width + 8, X = cx(best[0]), Y = cx(best[1]); c.fillStyle = "rgba(6,7,8,0.78)"; c.fillRect(X - w / 2, Y - 8, w, 16); c.fillStyle = "#ece9e3"; c.textAlign = "center"; c.fillText(t, X, Y + 0.5); }
        }
      }
      // frame furniture: mm ticks, corner brackets, readouts
      c.strokeStyle = "rgba(236,233,227,0.55)"; c.beginPath();
      for (let mm = 0; mm <= 8; mm++) { const p = mm / 8 * W, l = mm % 2 ? 5 : 10; c.moveTo(p, H); c.lineTo(p, H - l); c.moveTo(0, H - p * H / W); c.lineTo(l, H - p * H / W); }
      c.stroke();
      const br = 18; c.strokeStyle = "rgba(236,233,227,0.9)"; c.beginPath();
      [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]].forEach(([x, y, a, b]) => { c.moveTo(x + a * br, y); c.lineTo(x, y); c.lineTo(x, y + b * br); });
      c.stroke();
      const fs = Math.max(10, Math.min(17, W / 52)); c.font = `400 ${fs}px ${MONO}`; c.textAlign = "left"; c.textBaseline = "top";
      const tag = (t, x, y, al) => { c.textAlign = al || "left"; const w = c.measureText(t).width; const X = al === "right" ? x - w : x; c.fillStyle = "rgba(6,7,8,0.8)"; c.fillRect(X - 6, y - 4, w + 12, fs + 9); c.fillStyle = "#ece9e3"; c.fillText(t, x, y); };
      const narrow = W < 520;
      tag(narrow ? "TIER 4 OF 4" : "TIER 4 OF 4 · BOTTOM DIE", 14, 14);
      tag(narrow ? "113.6 W" : "COLD PLATE ON TIER 1 · 113.6 W", W - 14, 14, "right");
      tag(done ? (narrow ? `CONVERGED · ${iter} SWEEPS` : `SOLVER CONVERGED · ${iter} SOR SWEEPS`) : `SOLVING · SWEEP ${String(iter).padStart(3, "0")}`, 14, H - fs - 18);
      tag("8 × 8 MM", W - 14, H - fs - 18, "right");
      // hot spot tracker
      crosshair(c, cx(hx), cx(hy), sc * 1.6, "#ece9e3");
      tag(`MAX ${fmt(hk)} K`, cx(hx) + sc * 2.2, cx(hy) - sc * 2.6);
      // pointer probe
      if (ptr) {
        const gx = Math.max(0, Math.min(N - 1, (ptr.x / W * N) | 0)), gy = Math.max(0, Math.min(N - 1, (ptr.y / H * N) | 0)), k = T[OFF + gy * N + gx];
        c.strokeStyle = "rgba(236,233,227,0.5)"; c.setLineDash([2, 4]); c.beginPath(); c.moveTo(0, ptr.y); c.lineTo(W, ptr.y); c.moveTo(ptr.x, 0); c.lineTo(ptr.x, H); c.stroke(); c.setLineDash([]);
        const t = `x ${((gx + 0.5) / 4).toFixed(2)}  y ${((gy + 0.5) / 4).toFixed(2)} mm  ${fmt(k)} K`;
        const right = ptr.x > W * 0.55; tag(t, ptr.x + (right ? -14 : 14), ptr.y + 12, right ? "right" : "left");
      }
    }
    cv.addEventListener("pointermove", (e) => { const r = cv.getBoundingClientRect(); ptr = { x: e.clientX - r.left, y: e.clientY - r.top }; dirty = true; kick(); });
    cv.addEventListener("pointerleave", () => { ptr = null; dirty = true; kick(); });
    size(); io.observe(cv);
    const on = () => (isDeck() ? deckScene.name === "hero" : visible.has(cv));
    return {
      cv, size,
      restart() { if (RM) return; T = new Float64Array(L * NN); iter = 0; done = false; dirty = true; },
      tick() { if (!on()) return false; step(); draw(); return !done; },
    };
  })();

  function crosshair(c, x, y, r, col) {
    c.strokeStyle = col; c.lineWidth = 1; c.beginPath();
    const g = r * 0.45;
    c.moveTo(x - r, y - r + g); c.lineTo(x - r, y - r); c.lineTo(x - r + g, y - r);
    c.moveTo(x + r - g, y - r); c.lineTo(x + r, y - r); c.lineTo(x + r, y - r + g);
    c.moveTo(x - r, y + r - g); c.lineTo(x - r, y + r); c.lineTo(x - r + g, y + r);
    c.moveTo(x + r - g, y + r); c.lineTo(x + r, y + r); c.lineTo(x + r, y + r - g);
    c.moveTo(x - r * 0.35, y); c.lineTo(x + r * 0.35, y); c.moveTo(x, y - r * 0.35); c.lineTo(x, y + r * 0.35);
    c.stroke();
  }

  /* =====================================================================================
     DEMO: four dies, flat then stacked (exploded isometric), then inverse design live
     ===================================================================================== */
  const demo = (() => {
    const cv = document.getElementById("demo-cv"); if (!cv) return null;
    const ctx = cv.getContext("2d");
    const spark = document.getElementById("spark"), sx = spark.getContext("2d");
    const $ = (id) => document.getElementById(id);
    const elPeak = $("peak"), elWhere = $("peak-where"), elBest = $("best"), elSteps = $("steps"), elCap = $("caption"), elPin = $("pin"), elSeed = $("seed"), elSr = $("sr-status");
    const btns = [...document.querySelectorAll(".ctl[data-mode]")];
    const texs = [0, 1, 2, 3].map(makeTex);
    const st = {
      mode: "flat", geo: 0, geoFrom: 0, geoTo: 0, geoT0: 0, geoDur: 1, layout: NAIVE.slice(), T: FLAT.temps,
      relax: null, opt: null, seed: 7, hist: [], step: 0, kept: 0, best: null, bestTemps: null, swaps: [], sel: null,
      auto: !RM, idleSince: 0, phase: "flat", solved: false, edited: false,
    };
    let W = 0, H = 0, dpr = 1, fitF = null, fitS = null, tgtF = null, tgtS = null, ptr = null, pinH = 1, mobile = false, dirty = true, lastPeak = -1, U = 14, lastNow = 0;

    /* geometry ------------------------------------------------------------------- */
    const G = () => 0.46;           // vertical gap between exploded tiers, in die widths
    function flatPos(l) { return mobile ? [(l % 2) * 1.22 - 1.11, ((l / 2) | 0) * 1.3 - 1.15, 0] : [(l - 1.5) * 1.24 - 0.5, -0.5, 0]; }
    function stackPos(l) { return [-0.5, -0.5, (L - 1 - l) * G()]; }
    const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    function cam(e) { const th = e * Math.PI / 4, ct = 1 - e * (1 - 0.5774); return { cs: Math.cos(th), sn: Math.sin(th), ct, stt: Math.sqrt(1 - ct * ct) }; }
    const proj = (C, x, y, z) => [x * C.cs - y * C.sn, (x * C.sn + y * C.cs) * C.ct - z * C.stt];
    function posAt(l, e) { const a = flatPos(l), b = stackPos(l); return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e]; }
    function bbox(e) {
      const C = cam(e); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let l = 0; l < L; l++) { const p = posAt(l, e); for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const q = proj(C, p[0] + u, p[1] + v, p[2]); x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); } }
      return { x0, x1, y0, y1 };
    }
    function fit(e, R) { const b = bbox(e), s = Math.min(R.w / (b.x1 - b.x0), R.h / (b.y1 - b.y0)); return { s, ox: R.x + R.w / 2 - s * (b.x0 + b.x1) / 2, oy: R.y + R.h / 2 - s * (b.y0 + b.y1) / 2 }; }
    function regions() {
      if (!isDeck()) {
        mobile = true; const top = 236, bot = H - 250;
        return [fit(0, { x: 20, y: top + 30, w: W - 112, h: bot - top - 60 }), fit(1, { x: 14, y: top, w: W - 196, h: bot - top })];
      }
      mobile = false;
      const R = (x, y, w, h) => ({ x: x * W, y: y * H, w: w * W, h: h * H });
      const F = R(0.035, 0.53, 0.63, 0.25);
      const sc = deckScene.name;
      const Sr = sc === "heat" ? R(0.6, 0.15, 0.2, 0.7) : sc === "partner" ? R(0.73, 0.22, 0.2, 0.56) : sc === "flat" ? R(0.4, 0.15, 0.2, 0.7) : R(0.345, 0.15, 0.215, 0.7);
      return [fit(0, F), fit(1, Sr)];
    }
    function retarget(snap) { [tgtF, tgtS] = regions(); if (snap || !fitF) { fitF = { ...tgtF }; fitS = { ...tgtS }; } dirty = true; }
    function approach(dt) {
      let moving = false; const k = RM ? 1 : 1 - Math.exp(-dt / 260);
      for (const [c, t] of [[fitF, tgtF], [fitS, tgtS]]) for (const key of ["s", "ox", "oy"]) {
        const d = t[key] - c[key]; if (Math.abs(d) > 0.2) { c[key] += d * k; moving = true; } else c[key] = t[key];
      }
      return moving;
    }
    function size() {
      dpr = DPR(); const r = cv.getBoundingClientRect(); W = r.width; H = r.height;
      U = isDeck() ? Math.min(W / 100, H * 1.7778 / 100) : 12;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      retarget(true);
      pinH = document.querySelector(".hud-scale").getBoundingClientRect().height;
      const sr = spark.getBoundingClientRect(); spark.width = Math.round(sr.width * dpr); spark.height = Math.round(sr.height * dpr);
      lastPeak = -1; dirty = true; drawSpark();
    }
    function view() {
      const e = ease(st.geo), C = cam(e), s = fitF.s + (fitS.s - fitF.s) * e, ox = fitF.ox + (fitS.ox - fitF.ox) * e, oy = fitF.oy + (fitS.oy - fitF.oy) * e;
      const P = (x, y, z) => { const q = proj(C, x, y, z); return [ox + s * q[0], oy + s * q[1]]; };
      return { e, C, s, P };
    }

    /* state changes -------------------------------------------------------------- */
    function setGeo(to, now) { if (st.geo === to) return; st.geoFrom = st.geo; st.geoTo = to; st.geoT0 = now; st.geoDur = RM ? 0 : 1300; if (RM) st.geo = to; }
    function startRelax(mode) {
      if (RM) { finishRelax(mode); return; }
      st.relax = { mode, iters: 0, wait: st.geo !== (mode === "flat" ? 0 : 1) };
    }
    function finishRelax(mode) {
      const naive = st.layout.every((k, i) => k === NAIVE[i]);
      st.T = naive ? (mode === "flat" ? FLAT.temps : STACK.temps) : S.solve(st.layout, L, mode === "flat" ? { mode: "flat" } : {}).temps;
      st.relax = null; st.idleSince = performance.now(); dirty = true; caption();
    }
    function go(mode, user) {
      const now = performance.now();
      if (user) st.auto = false;
      st.opt = null; st.sel = null;
      if (mode === "flat" || mode === "stack") {
        st.layout = NAIVE.slice(); st.solved = false; st.edited = false; st.hist = []; st.step = 0; st.kept = 0; st.best = null; st.swaps = [];
        setGeo(mode === "flat" ? 0 : 1, now); st.mode = mode; startRelax(mode === "flat" ? "flat" : "stacked");
      } else {
        st.layout = NAIVE.slice(); st.solved = false; st.edited = false; st.swaps = [];
        st.mode = "solve"; setGeo(1, now);
        if (st.geo === 1 && !RM) st.T = STACK.temps;
        st.relax = null; st.hist = [{ p: STACK.peak, b: STACK.peak }]; st.step = 0; st.kept = 0; st.best = STACK.peak; st.bestTemps = STACK.temps;
        st.opt = S.optimize(NAIVE, L, { steps: 400, seed: st.seed });
        st.optWait = !RM && st.geo !== 1;
        if (RM) runOptSync();
      }
      btns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === st.mode)));
      st.idleSince = now; dirty = true; caption(); drawSpark(); kick();
    }
    function absorb(v) {
      st.step = v.step; if (v.accepted) { st.kept++; st.swaps.push({ i: v.swap[0], j: v.swap[1], t: performance.now() }); if (st.swaps.length > 4) st.swaps.shift(); }
      st.layout = v.layout; st.T = v.temps; st.best = v.best; if (v.bestTemps) st.bestTemps = v.bestTemps; st.bestLayout = v.bestLayout;
      st.hist.push({ p: v.peak, b: v.best });
    }
    function endOpt() {
      st.opt = null; st.solved = true; st.layout = st.bestLayout.slice(); st.T = st.bestTemps; st.idleSince = performance.now(); st.swaps = []; dirty = true; caption(); drawSpark();
      elSr.textContent = `Inverse solve finished: peak ${fmt(st.best)} K, down from ${fmt(STACK.peak)} K.`;
    }
    function runOptSync() { // reduced motion: solve in chunks off the critical path, show only the result
      const g = st.opt;
      const chunk = () => { if (st.opt !== g) return; const t0 = performance.now(); let r; while (performance.now() - t0 < 12) { r = g.next(); if (r.done) { endOpt(); kick(); return; } absorb(r.value); } setTimeout(chunk, 0); };
      setTimeout(chunk, 0);
    }
    function caption() {
      let t;
      const w = tierWatts(st.layout).map((x) => x.toFixed(1)).join(" / ");
      if (st.mode === "flat") t = "Side by side: every die sits on the cold plate. Four tiers, 113.6 W.";
      else if (st.mode === "stack" && !st.edited) t = "Stacked: only tier 1 touches the plate. Heat made in tier 4 crosses three bonds to get out. Click two blocks to swap them.";
      else if (st.mode === "stack") t = `Swapped by hand and re-solved. Power per tier, top to bottom: ${w} W.`;
      else if (!st.solved) t = "Swapping blocks across tiers. Every candidate is scored by the solver.";
      else t = `Hot blocks moved up toward the plate. Watts per tier, top down: ${w}. Naive stack: 28.4 each.`;
      if (elCap.textContent !== t) elCap.textContent = t;
    }

    /* per-frame ------------------------------------------------------------------ */
    function update(now) {
      const dt = Math.min(100, now - (lastNow || now)); lastNow = now;
      let busy = approach(dt);
      if (st.geo !== st.geoTo) {
        const f = Math.min(1, (now - st.geoT0) / st.geoDur); st.geo = st.geoFrom + (st.geoTo - st.geoFrom) * f; busy = true;
        if (st.relax && st.relax.wait && f > 0.55) st.relax.wait = false;
        if (st.opt && st.optWait && f >= 1) st.optWait = false;
      } else if (st.relax) st.relax.wait = false;
      if (st.relax && !st.relax.wait) {
        const r = S.solve(st.layout, L, { mode: st.relax.mode, warm: st.T, maxIter: 2 });
        st.T = r.temps; st.relax.iters += r.iters; busy = true;
        if (r.iters < 2 || st.relax.iters > 240) finishRelax(st.relax.mode);
      }
      if (st.opt && !st.optWait && !RM) {
        const t0 = performance.now(); let n = 0;
        const per = isDeck() ? 1 : 2;
        while (n < per && (n < 1 || performance.now() - t0 < 5)) { const r = st.opt.next(); if (r.done) { endOpt(); break; } absorb(r.value); n++; }
        busy = true; drawSpark();
      }
      if (st.swaps.length) busy = true;
      let alive = false;
      // autoplay: flat -> stacked -> inverse solve -> back, until the visitor touches anything
      if (st.auto && !isDeck() && !busy && !st.relax && !st.opt) {
        const idle = now - st.idleSince;
        if (st.mode === "flat" && idle > 2600) go("stack");
        else if (st.mode === "stack" && idle > 2600) go("solve");
        else if (st.mode === "solve" && st.solved && idle > 4200) go("flat");
        alive = true;
      }
      if (busy) dirty = true;
      return busy || alive;
    }

    function draw(now) {
      if (!dirty) return; dirty = false;
      const quiet = isDeck() && deckScene.name === "partner";
      const c = ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
      const V = view(), { e, P, s } = V, T = st.T;
      // layer peaks and hottest
      const peaks = [], arg = [];
      for (let l = 0; l < L; l++) { const [i, m] = argmax(T, l * NN, (l + 1) * NN); peaks.push(m); arg.push(i); }
      let hot = 0; for (let l = 1; l < L; l++) if (peaks[l] > peaks[hot] + 0.005) hot = l;
      const tie = peaks.every((p) => Math.abs(p - peaks[0]) < 0.01);
      const peak = peaks[hot];

      // floor grid, faint, only for the flat view
      // cold plate
      const plate = (() => {
        const f = mobile ? [[-1.25, -1.3], [1.47, -1.3], [1.47, 1.29], [-1.25, 1.29]] : [[-2.47, -0.62], [2.47, -0.62], [2.47, 0.62], [-2.47, 0.62]];
        const sp = [[-0.56, -0.56], [0.56, -0.56], [0.56, 0.56], [-0.56, 0.56]], zt = (L - 1) * G() + G() * 0.62;
        return f.map((a, k) => [a[0] + (sp[k][0] - a[0]) * e, a[1] + (sp[k][1] - a[1]) * e, -0.02 + (zt + 0.02) * e]);
      })();
      const drawPlate = () => {
        const q = plate.map((p) => P(...p));
        c.strokeStyle = `rgba(236,233,227,${0.22 + 0.25 * e})`; c.lineWidth = 1; c.beginPath(); q.forEach((p, k) => (k ? c.lineTo(...p) : c.moveTo(...p))); c.closePath(); c.stroke();
        // microchannel hatching along the coolant direction
        c.strokeStyle = `rgba(150,170,195,${0.10 + 0.22 * e})`; c.beginPath();
        for (let k = 1; k < 12; k++) { const f = k / 12, a = lerp2(plate[0], plate[3], f), b = lerp2(plate[1], plate[2], f); const A = P(...a), B = P(...b); c.moveTo(...A); c.lineTo(...B); }
        c.stroke();
        c.font = `400 ${Math.max(10, Math.round(U * 0.7))}px ${MONO}`; c.fillStyle = "rgba(236,233,227,0.7)"; c.textBaseline = "alphabetic"; c.textAlign = "left";
        if (quiet) return;
        const lab = e > 0.5 ? P(...plate[1]) : P(...plate[0]);
        c.fillText("COLD PLATE", lab[0] + (e > 0.5 ? 10 : 0), lab[1] - 8);
      };
      if (e < 0.5) drawPlate();

      // dies, bottom tier first
      for (let l = L - 1; l >= 0; l--) {
        const p = posAt(l, e), o = P(p[0], p[1], p[2]), a = P(p[0] + 1, p[1], p[2]), b = P(p[0], p[1] + 1, p[2]);
        const ax = [a[0] - o[0], a[1] - o[1]], bx = [b[0] - o[0], b[1] - o[1]];
        // die thickness (side faces) once tilted
        if (V.C.stt > 0.05) {
          const h = 0.045, F = (u, v, dz) => P(p[0] + u, p[1] + v, p[2] - dz);
          c.fillStyle = "#101114"; c.strokeStyle = "rgba(236,233,227,0.28)"; c.lineWidth = 1;
          for (const face of [[[0, 1], [1, 1]], [[1, 0], [1, 1]]]) {
            const q = [F(...face[0], 0), F(...face[1], 0), F(...face[1], h), F(...face[0], h)];
            c.beginPath(); q.forEach((pt, k) => (k ? c.lineTo(...pt) : c.moveTo(...pt))); c.closePath(); c.fill(); c.stroke();
          }
        }
        paintTex(texs[l], T, l * NN);
        c.setTransform(dpr * ax[0] / TN, dpr * ax[1] / TN, dpr * bx[0] / TN, dpr * bx[1] / TN, dpr * o[0], dpr * o[1]);
        c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "high"; c.drawImage(texs[l].c, 0, 0);
        // tile grid + block names printed in the die plane
        c.setTransform(dpr * ax[0], dpr * ax[1], dpr * bx[0], dpr * bx[1], dpr * o[0], dpr * o[1]);
        c.lineWidth = 1 / s; c.strokeStyle = "rgba(4,4,5,0.35)"; c.beginPath();
        for (let k = 1; k < 4; k++) { c.moveTo(k / 4, 0); c.lineTo(k / 4, 1); c.moveTo(0, k / 4); c.lineTo(1, k / 4); }
        c.stroke();
        if (s > 90) {
          c.font = `500 ${0.05}px ${MONO}`; c.textAlign = "center"; c.textBaseline = "middle";
          for (let k = 0; k < 16; k++) {
            const tt = st.layout[l * 16 + k], tx = (k % 4 + 0.5) / 4, ty = ((k / 4 | 0) + 0.5) / 4;
            const kk = T[l * NN + ((k / 4 | 0) * 8 + 4) * N + (k % 4) * 8 + 4];
            c.fillStyle = lumOf(kk) > 0.5 ? "rgba(8,6,4,0.62)" : "rgba(236,233,227,0.42)";
            c.fillText(SHORT[tt], tx, ty);
          }
        }
        if (st.sel && st.sel.l === l) { const k = st.sel.k; c.strokeStyle = "#ece9e3"; c.lineWidth = 2 / s; c.strokeRect((k % 4) / 4 + 0.01, (k / 4 | 0) / 4 + 0.01, 0.23, 0.23); }
        if (ptr && ptr.hit && ptr.hit.l === l && canSwap()) { const k = ptr.hit.k; c.strokeStyle = "rgba(236,233,227,0.55)"; c.lineWidth = 1 / s; c.strokeRect((k % 4) / 4 + 0.02, (k / 4 | 0) / 4 + 0.02, 0.21, 0.21); }
        c.lineWidth = 1.2 / s; c.strokeStyle = l === hot && !tie ? "rgba(242,163,58,0.95)" : "rgba(236,233,227,0.5)"; c.strokeRect(0, 0, 1, 1);
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      // exploded-view alignment lines between tiers
      if (e > 0.02) {
        c.strokeStyle = `rgba(236,233,227,${0.22 * e})`; c.setLineDash([2, 4]); c.lineWidth = 1; c.beginPath();
        for (let l = 0; l < L - 1; l++) { const p = posAt(l, e), q = posAt(l + 1, e); for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { const A = P(p[0] + u, p[1] + v, p[2] - 0.045), B = P(q[0] + u, q[1] + v, q[2]); c.moveTo(...A); c.lineTo(...B); } }
        c.stroke(); c.setLineDash([]);
      }
      if (e >= 0.5) drawPlate();

      // swap markers: both blocks bracketed, joined by a thin line, fading out
      const tc = (slot) => { const l = slot / 16 | 0, k = slot % 16, p = posAt(l, e); return P(p[0] + (k % 4 + 0.5) / 4, p[1] + ((k / 4 | 0) + 0.5) / 4, p[2]); };
      st.swaps = st.swaps.filter((w) => now - w.t < 650);
      for (const w of st.swaps) {
        const f = 1 - (now - w.t) / 650, A = tc(w.i), B = tc(w.j);
        c.strokeStyle = `rgba(236,233,227,${0.85 * f})`; c.lineWidth = 1; c.beginPath(); c.moveTo(...A); c.lineTo(...B); c.stroke();
        crosshair(c, A[0], A[1], s * 0.07, `rgba(236,233,227,${f})`); crosshair(c, B[0], B[1], s * 0.07, `rgba(236,233,227,${f})`);
      }

      if (quiet) return finishDom(peak, peaks, hot, tie);
      // hot-spot tracker on the hottest cell
      {
        const i = arg[hot], l = hot, cell = i - l * NN, p = posAt(l, e);
        const X = P(p[0] + ((cell % N) + 0.5) / N, p[1] + ((cell / N | 0) + 0.5) / N, p[2]);
        crosshair(c, X[0], X[1], Math.max(7, s * 0.05), "#ece9e3");
      }

      // per-tier peak labels: under each die when flat, on leaders to the right when stacked
      const f1 = Math.max(11, Math.round(U * 0.78)), f2 = Math.max(14, Math.round(U * 1.2));
      c.font = `400 ${f1}px ${MONO}`; c.textBaseline = "middle";
      const rightCol = Math.max(...[0, 1, 2, 3].map((l) => { const p = posAt(l, e); return P(p[0] + 1, p[1], p[2])[0]; })) + 34;
      for (let l = 0; l < L; l++) {
        const p = posAt(l, e);
        const under = P(p[0] + 0.5, p[1] + 1, p[2]), corner = P(p[0] + 1, p[1], p[2]);
        const lw = Math.max(c.measureText(`TIER ${l + 1}`).width, f2 * 0.6 * 7);
        const fx = under[0] - lw / 2, fy = under[1] + f2 * (mobile ? 1.9 : 2.7);
        const isHot = l === hot && !tie;
        const lx = fx + (rightCol - fx) * e, ly = fy + (corner[1] - fy) * e;
        if (e > 0.02) { c.strokeStyle = `rgba(236,233,227,${0.35 * e})`; c.beginPath(); c.moveTo(corner[0] + 4, corner[1]); c.lineTo(lx - 8, ly); c.stroke(); }
        c.textAlign = "left"; c.fillStyle = isHot ? "#f2a33a" : "rgba(236,233,227,0.62)";
        c.fillText(`TIER ${l + 1}`, lx, ly - f2 * 0.62);
        c.fillStyle = isHot ? "#f2a33a" : "#ece9e3"; c.font = `400 ${f2}px ${MONO}`;
        c.fillText(`${fmt(peaks[l])} K${isHot && !mobile ? "  MAX" : ""}`, lx, ly + f1 * 0.75);
        c.font = `400 ${f1}px ${MONO}`;
      }

      // pointer probe
      if (ptr && ptr.hit) {
        const h = ptr.hit, k = T[h.l * NN + h.gy * N + h.gx];
        const t = `TIER ${h.l + 1}  x ${((h.gx + 0.5) / 4).toFixed(2)} y ${((h.gy + 0.5) / 4).toFixed(2)} mm  ${fmt(k)} K`;
        c.font = `400 ${Math.max(11, Math.round(U * 0.8))}px ${MONO}`; const w = c.measureText(t).width; const right = ptr.x + w + 30 > W;
        const X = right ? ptr.x - 16 - w : ptr.x + 16, Y = ptr.y + 18;
        c.fillStyle = "rgba(4,4,5,0.86)"; c.fillRect(X - 7, Y - U * 0.8, w + 14, U * 1.6); c.fillStyle = "#ece9e3"; c.textAlign = "left"; c.fillText(t, X, Y);
      }

      finishDom(peak, peaks, hot, tie);
    }
    function finishDom(peak, peaks, hot, tie) {
      // DOM readouts (text + one transform; nothing read back from layout)
      if (Math.abs(peak - lastPeak) > 0.004) {
        lastPeak = peak; elPeak.textContent = fmt(peak);
        elPin.style.transform = `translateY(${((1 - Math.min(peak, TMAX) / TMAX) * pinH).toFixed(1)}px)`;
      }
      const where = tie ? "every tier" : `tier ${hot + 1}`; if (elWhere.textContent !== where) elWhere.textContent = where;
      const bt = st.mode !== "solve" || st.best == null ? (st.mode === "stack" && !st.edited ? `naive stack, ${fmt(STACK.peak)} K` : st.mode === "flat" ? "side by side" : " ")
        : st.solved ? `${fmt(st.best - STACK.peak)} K vs naive stack` : `best so far ${fmt(st.best)} K`;
      if (elBest.textContent !== bt) elBest.textContent = bt;
      const stp = `Step ${String(st.step).padStart(3, "0")} / 400 · swaps kept ${String(st.kept).padStart(3, "0")}`;
      if (elSteps.textContent !== stp) elSteps.textContent = stp;
    }
    const SHORT = { core: "CORE", accel: "ACC", io: "I/O", sram: "SRAM" };
    const lerp2 = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];

    function drawSpark() {
      const c = sx, w = spark.width / dpr, h = spark.height / dpr; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
      const lo = 28, hi = 58, Y = (k) => h - 4 - (k - lo) / (hi - lo) * (h - 10), X = (i) => i / 400 * (w - 2) + 1;
      c.strokeStyle = "rgba(236,233,227,0.16)"; c.lineWidth = 1; c.beginPath(); c.moveTo(0, h - 0.5); c.lineTo(w, h - 0.5); c.stroke();
      c.setLineDash([2, 3]); c.beginPath(); c.moveTo(0, Y(STACK.peak)); c.lineTo(w, Y(STACK.peak)); c.stroke(); c.setLineDash([]);
      c.font = `400 ${Math.max(9, Math.round(U * 0.62))}px ${MONO}`; c.fillStyle = "rgba(236,233,227,0.5)"; c.textBaseline = "bottom"; c.textAlign = "right"; c.fillText(`${fmt(STACK.peak)} STACKED`, w - 2, Y(STACK.peak) - 2);
      if (st.hist.length < 2) return;
      c.strokeStyle = "rgba(236,233,227,0.35)"; c.beginPath(); st.hist.forEach((q, i) => (i ? c.lineTo(X(i), Y(q.p)) : c.moveTo(X(i), Y(q.p)))); c.stroke();
      c.strokeStyle = "#f2a33a"; c.lineWidth = 1.5; c.beginPath(); st.hist.forEach((q, i) => (i ? c.lineTo(X(i), Y(q.b)) : c.moveTo(X(i), Y(q.b)))); c.stroke();
      const last = st.hist[st.hist.length - 1]; c.fillStyle = "#f2a33a"; c.fillRect(X(st.hist.length - 1) - 2, Y(last.b) - 2, 4, 4);
    }

    /* interaction ---------------------------------------------------------------- */
    function hitTest(x, y) {
      const V = view();
      for (let l = 0; l < L; l++) { // top tier drawn last, so test it first
        const p = posAt(l, V.e), o = V.P(p[0], p[1], p[2]), a = V.P(p[0] + 1, p[1], p[2]), b = V.P(p[0], p[1] + 1, p[2]);
        const ax = a[0] - o[0], ay = a[1] - o[1], bx = b[0] - o[0], by = b[1] - o[1], det = ax * by - ay * bx, dx = x - o[0], dy = y - o[1];
        const u = (dx * by - dy * bx) / det, v = (ax * dy - ay * dx) / det;
        if (u >= 0 && u < 1 && v >= 0 && v < 1) return { l, u, v, gx: (u * N) | 0, gy: (v * N) | 0, k: ((v * 4) | 0) * 4 + ((u * 4) | 0) };
      }
      return null;
    }
    const canSwap = () => !st.opt && !st.relax && st.geo === st.geoTo;
    cv.addEventListener("pointermove", (e) => { const r = cv.getBoundingClientRect(); ptr = { x: e.clientX - r.left, y: e.clientY - r.top }; ptr.hit = hitTest(ptr.x, ptr.y); dirty = true; kick(); });
    cv.addEventListener("pointerleave", () => { ptr = null; dirty = true; kick(); });
    cv.addEventListener("click", (e) => {
      const r = cv.getBoundingClientRect(), h = hitTest(e.clientX - r.left, e.clientY - r.top);
      if (isDeck() || !h || !canSwap()) return;
      st.auto = false;
      const slot = h.l * 16 + h.k;
      if (!st.sel) { st.sel = { l: h.l, k: h.k, slot }; dirty = true; kick(); return; }
      if (st.sel.slot === slot) { st.sel = null; dirty = true; kick(); return; }
      const a = st.sel.slot; st.sel = null;
      const lay = st.layout.slice(); [lay[a], lay[slot]] = [lay[slot], lay[a]]; st.layout = lay;
      st.swaps = [{ i: a, j: slot, t: performance.now() }];
      const flat = st.geoTo === 0;
      if (!flat) { st.mode = "stack"; st.edited = true; st.solved = false; btns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === "stack"))); }
      startRelax(flat ? "flat" : "stacked"); caption(); kick();
    });
    const SC = { flat: "flat", stack: "stack", solve: "solve" };
    btns.forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); if (isDeck() && window.__deck) window.__deck.jump(SC[b.dataset.mode], true); else go(b.dataset.mode, true); }));
    $("seed-btn").addEventListener("click", (e) => { e.stopPropagation(); st.seed = st.seed >= 99 ? 1 : st.seed + 1; elSeed.textContent = st.seed; if (isDeck() && window.__deck) window.__deck.jump("solve", true, true); else go("solve", true); });
    function scene(name) { // deck mode drives the model from the scene
      st.auto = false;
      if (name === "partner") { if (st.mode === "flat") go("stack"); }
      else if (name === "hero" || name === "team") { if (name === "hero" && st.mode !== "flat") { const rm = st.geoDur; go("flat"); st.geo = 0; st.geoTo = 0; st.relax = null; st.T = FLAT.temps; } }
      else if (name === "flat") { if (st.mode !== "flat") go("flat"); }
      else if (name === "stack") { if (st.mode !== "stack" || st.edited) go("stack"); }
      else if (name === "heat") { if (st.mode !== "stack" || st.edited) go("stack"); }
      else if (name === "solve") go("solve");
      retarget(false); kick();
    }
    cv.__onShow = () => { if (st.auto && st.mode === "flat" && !st.relax) st.idleSince = performance.now(); };
    size(); io.observe(cv); caption();
    return {
      cv,
      tick(now) { if (!(isDeck() ? HTML.dataset.model === "on" : visible.has(cv))) { lastNow = 0; return false; } const busy = update(now); draw(now); return busy || !!ptr; },
      get state() { return st; }, go, scene, idle: () => !st.opt && !st.relax, size,
    };
  })();

  /* =====================================================================================
     DECK: full-screen scenes for a big screen. Auto-advances and loops; presenter keys.
     ===================================================================================== */
  const deck = (() => {
    const scenes = [...document.querySelectorAll(".scene")], n = scenes.length, names = scenes.map((x) => x.dataset.scene);
    const segs = document.getElementById("segs"); segs.innerHTML = scenes.map(() => "<b><i></i></b>").join("");
    const bars = [...segs.children].map((b) => b.firstChild);
    const label = document.getElementById("scene-label");
    const MODEL = new Set(["flat", "stack", "heat", "solve", "partner"]);
    let cur = -1, acc = 0, paused = false, holdUntil = 0, last = 0, wheelAt = 0;
    const setLabel = () => { label.textContent = `${String(cur + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}\u2002${scenes[cur].dataset.title}${paused ? "\u2002\u00b7\u2002paused" : ""}`; };
    const poke = () => { holdUntil = performance.now() + 12000; };
    function show(i, user) {
      cur = ((i % n) + n) % n; const name = names[cur];
      scenes.forEach((x, k) => { x.classList.toggle("on", k === cur); x.setAttribute("aria-hidden", String(isDeck() && k !== cur)); });
      HTML.dataset.scene = name; HTML.dataset.model = MODEL.has(name) ? "on" : "off"; deckScene.name = name;
      if (name === "hero" && hero) hero.restart();
      if (demo) demo.scene(name);
      acc = 0; bars.forEach((b, k) => { b.style.transform = `scaleX(${k < cur ? 1 : 0})`; });
      setLabel(); if (user) poke(); kick();
    }
    function tick(now) {
      if (!isDeck() || cur < 0) { last = 0; return false; }
      const dt = last ? Math.min(100, now - last) : 0; last = now;
      if (!paused && now > holdUntil) acc += dt;
      const f = Math.min(1, acc / (+scenes[cur].dataset.dur * 1000));
      bars[cur].style.transform = `scaleX(${f.toFixed(4)})`;
      if (f >= 1 && !(names[cur] === "solve" && demo && !demo.idle())) show(cur + 1);
      return true;
    }
    function fullscreen() { const d = document; if (!d.fullscreenElement) { (HTML.requestFullscreen || HTML.webkitRequestFullscreen || (() => {})).call(HTML); } else (d.exitFullscreen || d.webkitExitFullscreen).call(d); }
    addEventListener("keydown", (e) => {
      if (!isDeck() || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key, onCtl = e.target.closest && e.target.closest("button, a");
      if (k === "ArrowRight" || k === "PageDown" || ((k === " " || k === "Enter") && !onCtl)) { e.preventDefault(); show(cur + 1, true); }
      else if (k === "ArrowLeft" || k === "PageUp") { e.preventDefault(); show(cur - 1, true); }
      else if (/^[1-9]$/.test(k) && +k <= n) show(+k - 1, true);
      else if (k === "Home") show(0, true);
      else if (k === "p" || k === "P") { paused = !paused; setLabel(); }
      else if (k === "f" || k === "F") fullscreen();
      else poke();
    });
    document.addEventListener("click", (e) => {
      if (!isDeck()) return;
      if (e.target.closest(".nav-brand")) { e.preventDefault(); show(0, true); return; }
      if (e.target.closest("a, button")) { poke(); return; }
      show(cur + 1, true);
    });
    addEventListener("wheel", (e) => {
      if (!isDeck() || Math.abs(e.deltaY) < 24) return; const t = performance.now(); if (t - wheelAt < 900) return; wheelAt = t;
      show(cur + (e.deltaY > 0 ? 1 : -1), true);
    }, { passive: true });
    return { show, tick, jump(name, user, force) { const i = names.indexOf(name); if (i !== cur || force || name === "solve") show(i, user); }, next: () => show(cur + 1, true), prev: () => show(cur - 1, true), get cur() { return cur; }, get names() { return names; } };
  })();
  window.__deck = deck;

  /* ---------- one rAF loop, runs only while something visible is moving ---------- */
  let raf = 0;
  function loop(now) {
    raf = 0;
    const a = hero ? hero.tick(now) : false, b = demo ? demo.tick(now) : false, c = deck.tick(now);
    if (a || b || c) raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }
  let rz = 0;
  addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => {
    if (isDeck() && deck.cur < 0) deck.show(0); else if (isDeck()) deck.show(deck.cur);
    if (!isDeck()) document.querySelectorAll(".scene").forEach((x) => x.removeAttribute("aria-hidden"));
    hero && hero.size(); demo && demo.size(); kick(); }, 120); });
  if (isDeck()) deck.show(0);
  document.fonts && document.fonts.ready.then(() => { hero && hero.size(); demo && demo.size(); kick(); });
  kick();

  // test hook for the screenshot script: window.__ir.demo.go("stack"), .state.T etc.
  window.__ir = { demo, hero, S, peaks: () => demo && S.layerPeaks({ temps: demo.state.T, layers: L }) };
})();
