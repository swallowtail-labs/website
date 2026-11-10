/* Swallowtail: a beat-cut line-art edit about 3D chips. Canvas 2D, no libraries.
   Heat fields and the layout search come from thermal.js (a real steady-state solve). */
(() => {
  "use strict";
  const TH = window.SwallowThermal;
  const cv = document.getElementById("c");
  const ctx = cv.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hint = document.getElementById("hint");
  const hintText = hint.textContent;

  let W = 1, H = 1, DPR = 1, B = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    B = Math.min(W / 16, H / 9);
  }
  addEventListener("resize", resize);
  resize();

  // ---------- physics, precomputed in small chunks so the page never stalls ----------
  const L = 4, NAIVE = TH.naiveStack(L), N = TH.N;
  const STACK = TH.solve(NAIVE, L);
  const trace = [{ layout: NAIVE, temps: STACK.temps, peak: STACK.peak }];
  const gen = TH.optimize(NAIVE, L, { steps: 400, seed: 7 });
  let genDone = false, genStep = 0, lastTemps = STACK.temps;
  function pumpOptimizer() {
    if (genDone) return;
    for (let i = 0; i < 12; i++) {
      const r = gen.next();
      if (r.done) { genDone = true; break; }
      const st = r.value; genStep++;
      if (st.bestTemps) lastTemps = st.bestTemps;
      if (genStep % 8 === 0) trace.push({ layout: st.bestLayout.slice(), temps: lastTemps, peak: st.best });
    }
  }
  // finish the search in the background too, so a throttled tab still has the whole trace
  (function chunk() { pumpOptimizer(); if (!genDone) setTimeout(chunk, 0); })();

  // ---------- drawing helpers ----------
  let INK = "#fff", ACC = "#ff4a36", HL = "rgba(255,221,51,0.9)", BG = "#000";
  const SERIF = '"STIX Two Text", "Times New Roman", Times, serif';
  const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
  const seg = (u, a, b) => clamp((u - a) / (b - a));

  function lw(k) { ctx.lineWidth = Math.max(1, B * 0.028 * k); }

  function poly(pts, t = 1) {
    if (t <= 0 || pts.length < 2) return;
    let tot = 0;
    const lens = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(l); tot += l; }
    let want = tot * clamp(t);
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      if (want >= lens[i - 1]) { ctx.lineTo(pts[i][0], pts[i][1]); want -= lens[i - 1]; }
      else { const f = want / lens[i - 1]; ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f); break; }
    }
    ctx.stroke();
  }
  function pointOn(pts, t) {
    let tot = 0; const lens = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(l); tot += l; }
    let want = tot * clamp(t);
    for (let i = 1; i < pts.length; i++) {
      if (want <= lens[i - 1]) { const f = want / lens[i - 1]; return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]; }
      want -= lens[i - 1];
    }
    return pts[pts.length - 1];
  }
  function dot(x, y, r, color = INK) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); }

  // math: parts = [[text, kind]] kind: "" | "sub" | "sup" | "up" (upright)
  function mathWidth(parts, size) {
    let w = 0;
    for (const [s, k] of parts) { ctx.font = (k === "up" ? "" : "italic ") + (k === "sub" || k === "sup" ? size * 0.6 : size) + "px " + SERIF; w += ctx.measureText(s).width; }
    return w;
  }
  function math(parts, x, y, size, reveal = 1, color = INK, align = "center") {
    const w = mathWidth(parts, size);
    let cx = align === "center" ? x - w / 2 : x;
    const x0 = cx;
    ctx.save();
    if (reveal < 1) { ctx.beginPath(); ctx.rect(x0 - size, y - size * 1.2, (w + size) * clamp(reveal) + size * 0.2, size * 2.4); ctx.clip(); }
    ctx.textBaseline = "alphabetic"; ctx.fillStyle = color;
    const boxes = [];
    for (const [s, k] of parts) {
      const sz = k === "sub" || k === "sup" ? size * 0.6 : size;
      ctx.font = (k === "up" ? "" : "italic ") + sz + "px " + SERIF;
      const dy = k === "sub" ? size * 0.22 : k === "sup" ? -size * 0.42 : 0;
      ctx.fillText(s, cx, y + size * 0.33 + dy);
      const ww = ctx.measureText(s).width;
      boxes.push([cx, ww]);
      cx += ww;
    }
    ctx.restore();
    return { x0, w, boxes };
  }
  function label(s, x, y, size, color = INK, align = "center", alpha = 1) {
    ctx.save(); ctx.globalAlpha *= alpha; ctx.font = "500 " + size + "px " + MONO; ctx.textAlign = align; ctx.textBaseline = "middle";
    ctx.fillStyle = color; ctx.fillText(s, x, y); ctx.restore();
  }
  function highlight(x, y, w, h, t) { if (t <= 0) return; ctx.save(); ctx.globalCompositeOperation = BG === "#000" ? "lighter" : "multiply"; ctx.fillStyle = HL; ctx.fillRect(x, y, w * clamp(t), h); ctx.restore(); }

  // isometric projection; die coords in [-1,1]
  function iso(x, y, z, o) {
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    const X = x * c - y * s, Y = x * s + y * c;
    return [o.cx + (X - Y) * 0.866 * o.s, o.cy + (X + Y) * 0.5 * o.s - z * o.s];
  }
  function isoRect(z, o, t = 1, x0 = -1, y0 = -1, x1 = 1, y1 = 1) {
    poly([iso(x0, y0, z, o), iso(x1, y0, z, o), iso(x1, y1, z, o), iso(x0, y1, z, o), iso(x0, y0, z, o)], t);
  }
  function isoFill(z, o, x0, y0, x1, y1, color) {
    const p = [iso(x0, y0, z, o), iso(x1, y0, z, o), iso(x1, y1, z, o), iso(x0, y1, z, o)];
    ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
  }

  // marching squares over one layer, drawn on the iso plane
  const MS = [[], [[3, 0]], [[0, 1]], [[3, 1]], [[1, 2]], [[3, 0], [1, 2]], [[0, 2]], [[3, 2]], [[2, 3]], [[0, 2]], [[0, 1], [2, 3]], [[1, 2]], [[1, 3]], [[0, 1]], [[3, 0]], []];
  function contours(temps, layer, lev, z, o) {
    const off = layer * N * N, g = (i, j) => temps[off + j * N + i];
    const toD = (gi, gj) => [-1 + (gi + 0.5) * 2 / N, -1 + (gj + 0.5) * 2 / N];
    ctx.beginPath();
    for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
      const a = g(i, j), b = g(i + 1, j), c = g(i + 1, j + 1), d = g(i, j + 1);
      const idx = (a > lev) | ((b > lev) << 1) | ((c > lev) << 2) | ((d > lev) << 3);
      if (idx === 0 || idx === 15) continue;
      const e = [
        () => [i + (lev - a) / (b - a), j], () => [i + 1, j + (lev - b) / (c - b)],
        () => [i + (lev - d) / (c - d), j + 1], () => [i, j + (lev - a) / (d - a)]];
      for (const [p, q] of MS[idx]) {
        const P = e[p](), Q = e[q]();
        const A = iso(...toD(P[0], P[1]), z, o), Bq = iso(...toD(Q[0], Q[1]), z, o);
        ctx.moveTo(A[0], A[1]); ctx.lineTo(Bq[0], Bq[1]);
      }
    }
    ctx.stroke();
  }
  function hottest(temps, layer) {
    const off = layer * N * N; let m = -1, mi = 0;
    for (let i = 0; i < N * N; i++) if (temps[off + i] > m) { m = temps[off + i]; mi = i; }
    return { t: m, x: -1 + ((mi % N) + 0.5) * 2 / N, y: -1 + (Math.floor(mi / N) + 0.5) * 2 / N };
  }
  const LEVELS = [6, 12, 18, 24, 30, 36, 42, 48];

  // stack layer heights (die 0 is the bottom die in thermal.js? cold plate is on layer 0 = top)
  // draw layer 0 on top: z = (L-1-layer) * gap
  const zOf = (layer, gap) => (L - 1 - layer) * gap;

  // ---------- shots ----------
  const C = () => [W / 2, H / 2];

  function shotSymbol(sym, parts) {
    return (u) => {
      const [cx, cy] = C();
      const s = B * 2.6 * (1 + u * 0.06);
      ctx.save(); ctx.shadowColor = "rgba(255,255,255,0.55)"; ctx.shadowBlur = B * 0.5;
      math(parts || [[sym, ""]], cx, cy, s, 1);
      ctx.restore();
    };
  }

  function shotWires(u) {
    const [cx, cy] = C();
    const s = B * 1.5, gapX = B * 4.2;
    const A = [cx - gapX, cy - B * 0.4], Bc = [cx + gapX, cy - B * 0.4];
    ctx.strokeStyle = INK; lw(1.4);
    const sq = (p, t) => poly([[p[0] - s, p[1] - s], [p[0] + s, p[1] - s], [p[0] + s, p[1] + s], [p[0] - s, p[1] + s], [p[0] - s, p[1] - s]], t);
    sq(A, ease(seg(u, 0, 0.25))); sq(Bc, ease(seg(u, 0.05, 0.3)));
    // die internals: a few blocks
    lw(0.7);
    for (const P of [A, Bc]) {
      const t = ease(seg(u, 0.2, 0.4));
      poly([[P[0] - s * 0.7, P[1] - s * 0.7], [P[0] - s * 0.05, P[1] - s * 0.7], [P[0] - s * 0.05, P[1] + s * 0.1], [P[0] - s * 0.7, P[1] + s * 0.1], [P[0] - s * 0.7, P[1] - s * 0.7]], t);
      poly([[P[0] + s * 0.15, P[1] - s * 0.7], [P[0] + s * 0.7, P[1] - s * 0.7], [P[0] + s * 0.7, P[1] + s * 0.7], [P[0] + s * 0.15, P[1] + s * 0.7], [P[0] + s * 0.15, P[1] - s * 0.7]], t);
    }
    // platform + wire
    const py = cy + B * 1.75;
    lw(1.0);
    poly([[cx - gapX - s * 1.6, py], [cx + gapX + s * 1.6, py]], ease(seg(u, 0.15, 0.4)));
    const wire = [[A[0] + s, A[1] + s * 0.4], [A[0] + s * 1.35, A[1] + s * 0.4], [A[0] + s * 1.35, py - B * 0.25], [Bc[0] - s * 1.35, py - B * 0.25], [Bc[0] - s * 1.35, Bc[1] + s * 0.4], [Bc[0] - s, Bc[1] + s * 0.4]];
    ctx.strokeStyle = ACC; lw(1.4);
    poly(wire, ease(seg(u, 0.3, 0.55)));
    if (u > 0.5) for (let k = 0; k < 4; k++) {
      const t = ((u - 0.5) * 1.6 + k * 0.25) % 1;
      const p = pointOn(wire, t); dot(p[0], p[1], B * 0.09, INK);
    }
    // dimension line
    const dy = py + B * 0.75, t = ease(seg(u, 0.55, 0.75));
    ctx.strokeStyle = INK; lw(0.8);
    poly([[A[0], dy], [Bc[0], dy]], t);
    poly([[A[0], dy - B * 0.15], [A[0], dy + B * 0.15]], t); poly([[Bc[0], dy - B * 0.15], [Bc[0], dy + B * 0.15]], t);
    if (t > 0.9) { ctx.fillStyle = BG; ctx.fillRect(cx - B * 0.7, dy - B * 0.3, B * 1.4, B * 0.6); math([["mm", "up"]], cx, dy, B * 0.5); }
  }

  function shotEq(parts, hiIdx, boxIdx) {
    return (u) => {
      const [cx, cy] = C();
      const size = B * 1.05;
      const r = ease(seg(u, 0, 0.55));
      const m = math(parts, cx, cy, size, r);
      if (hiIdx != null) { const [x, w] = m.boxes[hiIdx]; highlight(x - B * 0.08, cy - size * 0.55, w + B * 0.16, size * 1.1, ease(seg(u, 0.6, 0.85))); math(parts, cx, cy, size, r); }
      if (boxIdx != null) {
        const [x, w] = m.boxes[boxIdx]; ctx.strokeStyle = ACC; lw(1.3);
        const x0 = x - B * 0.12, x1 = x + w + B * 0.12, y0 = cy - size * 0.62, y1 = cy + size * 0.66;
        poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]], ease(seg(u, 0.6, 0.9)));
      }
    };
  }

  function stackOpts(u, spin = 0.25) {
    const [cx, cy] = C();
    return { cx, cy: cy + B * 1.1, s: B * 2.25, rot: -0.35 + u * spin };
  }
  function shotStack(u) {
    const o = stackOpts(u, 0.35), gap = 0.55;
    ctx.strokeStyle = INK;
    for (let l = L - 1; l >= 0; l--) {
      const k = L - 1 - l;
      lw(1.3); isoRect(zOf(l, gap), o, ease(seg(u, k * 0.12, k * 0.12 + 0.3)));
    }
    // vias between layers
    ctx.strokeStyle = ACC; lw(0.9);
    const vt = ease(seg(u, 0.45, 0.75));
    for (let k = 0; k < L - 1; k++) {
      const z0 = k * gap, z1 = (k + 1) * gap;
      for (let a = -0.6; a <= 0.61; a += 0.3) for (let b = -0.6; b <= 0.61; b += 0.3) {
        const p = iso(a, b, z0, o), q = iso(a, b, z0 + (z1 - z0) * vt, o);
        ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      }
    }
    const t = ease(seg(u, 0.75, 0.9));
    if (t > 0) {
      const p = iso(1, -1, gap * 2, o), q = iso(1, -1, gap * 3, o);
      ctx.strokeStyle = INK; lw(0.8);
      poly([[p[0] + B * 0.5, p[1]], [q[0] + B * 0.5, q[1]]], t);
      math([["µm", "up"]], p[0] + B * 1.2, (p[1] + q[1]) / 2, B * 0.5, t);
    }
  }

  function drawHeatStack(o, temps, u, opt) {
    const gap = 0.62;
    ctx.strokeStyle = INK; lw(1.1);
    for (let l = L - 1; l >= 0; l--) isoRect(zOf(l, gap), o, 1);
    const nLev = opt.reveal != null ? Math.floor(opt.reveal * LEVELS.length + 0.999) : LEVELS.length;
    for (let l = L - 1; l >= 0; l--) {
      for (let k = 0; k < nLev; k++) {
        const lev = LEVELS[k];
        ctx.strokeStyle = lev >= 36 ? ACC : INK;
        ctx.globalAlpha = lev >= 36 ? 1 : 0.55 + 0.05 * k;
        lw(lev >= 36 ? 1.2 : 0.7);
        contours(temps, l, lev, zOf(l, gap), o);
      }
    }
    ctx.globalAlpha = 1;
    if (opt.tiles) {
      for (let l = 0; l < L; l++) for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
        const kind = opt.tiles[l * 16 + ty * 4 + tx];
        if (kind !== "core") continue;
        const x0 = -1 + tx * 0.5 + 0.08, y0 = -1 + ty * 0.5 + 0.08;
        isoFill(zOf(l, gap), o, x0, y0, x0 + 0.34, y0 + 0.34, "rgba(255,255,255,0.85)");
      }
    }
    // hottest point marker
    let hot = { t: -1 };
    let hl = 0;
    for (let l = 0; l < L; l++) { const h = hottest(temps, l); if (h.t > hot.t) { hot = h; hl = l; } }
    const p = iso(hot.x, hot.y, zOf(hl, gap), o);
    ctx.strokeStyle = ACC; lw(1.2);
    ctx.beginPath(); ctx.arc(p[0], p[1], B * 0.32, 0, Math.PI * 2); ctx.stroke();
    return { hot, p };
  }

  function shotHeat(u) {
    const tall = H > W;
    const o = stackOpts(0.3, 0); o.s = B * 1.75; o.cx = tall ? W / 2 : W / 2 - B * 1.6;
    if (tall) { o.s = B * 2.6; o.cy = H / 2 - B * 1.2; }
    const r = ease(seg(u, 0, 0.6));
    const { hot, p } = drawHeatStack(o, STACK.temps, u, { reveal: r });
    const val = hot.t * ease(seg(u, 0.1, 0.7));
    ctx.strokeStyle = ACC; lw(0.8);
    const lx = tall ? W / 2 - B * 3.2 : W / 2 + B * 3.4, ly = tall ? H / 2 + B * 5 : H / 2 - B * 1.6;
    poly([[p[0] + B * 0.32, p[1]], [lx - B * 0.2, ly + B * 0.3]], ease(seg(u, 0.3, 0.5)));
    math([["T", ""], ["max", "sub"], [" = " + val.toFixed(2) + " K", "up"]], lx, ly, B * 0.62, 1, INK, "left");
    label("TOY THERMAL MODEL · 4 DIES · 113.6 W", lx, ly + B * 0.85, B * 0.2, INK, "left", 0.6);
  }

  function shotPage(u) {
    BG = "#f3efe6";
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    const [cx, cy] = C();
    const z = 1 + u * 0.14;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy);
    const lines = ["Heat cannot escape. In a 3D stack the", "inner layers have no surface to shed heat,", "so the hottest die sits furthest from the", "cold plate."];
    let size = B * 0.78;
    ctx.font = size + "px " + SERIF;
    const wide = Math.max(...lines.map((l) => ctx.measureText(l).width));
    size *= Math.min(1, (W * 0.8) / (wide * 1.14));
    ctx.font = size + "px " + SERIF; ctx.fillStyle = "#1a1a1a"; ctx.textBaseline = "middle";
    const x0 = cx - Math.max(...lines.map((l) => ctx.measureText(l).width)) / 2;
    lines.forEach((ln, i) => ctx.fillText(ln, x0, cy - size * 2.1 + i * size * 1.45));
    // highlight "shed heat"
    const pre = ctx.measureText("inner layers have no surface to ").width, w = ctx.measureText("shed heat").width;
    ctx.globalCompositeOperation = "multiply"; ctx.fillStyle = "rgba(255,221,51,0.85)";
    ctx.fillRect(x0 + pre - B * 0.05, cy - size * 2.1 + size * 1.45 - size * 0.62, (w + B * 0.1) * ease(seg(u, 0.25, 0.6)), size * 1.2);
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }

  function shotLoop(u) {
    const [cx, cy] = C();
    const xs = [cx - B * 4.6, cx, cx + B * 4.6], y = cy + B * 0.4, r = B * 0.85;
    const names = [[["x", ""]], [["T", ""], ["(", "up"], ["x", ""], [")", "up"]], [["f", ""]]];
    const caps = ["design", "physics", "objective"];
    ctx.strokeStyle = INK; lw(1.2);
    xs.forEach((x, i) => {
      const t = ease(seg(u, i * 0.12, i * 0.12 + 0.25));
      if (t <= 0) return;
      ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t); ctx.stroke();
      math(names[i], x, y, B * 0.62, t);
      label(caps[i].toUpperCase(), x, y + r + B * 0.5, B * 0.26, INK, "center", 0.8 * t);
    });
    // forward arrows
    for (let i = 0; i < 2; i++) {
      const t = ease(seg(u, 0.25 + i * 0.1, 0.4 + i * 0.1));
      const a = xs[i] + r + B * 0.15, b = xs[i + 1] - r - B * 0.15;
      poly([[a, y], [b, y]], t);
      if (t > 0.95) poly([[b - B * 0.22, y - B * 0.16], [b, y], [b - B * 0.22, y + B * 0.16]], 1);
    }
    // inverse arc back
    const t = ease(seg(u, 0.55, 0.85));
    if (t > 0) {
      ctx.strokeStyle = ACC; lw(1.5);
      const pts = [];
      for (let k = 0; k <= 60; k++) { const a = k / 60; const x = xs[2] + (xs[0] - xs[2]) * a; pts.push([x, y - r - B * 0.2 - Math.sin(Math.PI * a) * B * 2.2]); }
      poly(pts, t);
      if (t > 0.97) { const e = pts[60]; poly([[e[0] - B * 0.2, e[1] - B * 0.26], [e[0], e[1]], [e[0] + B * 0.24, e[1] - B * 0.18]], 1); }
      label("INVERSE", cx, y - r - B * 2.75, B * 0.26, ACC, "center", t);
    }
  }

  function shotDescent(u) {
    const [cx, cy] = C();
    const x0 = cx - B * 6, x1 = cx + B * 6, yb = cy + B * 2.4;
    // loss with a shallow local minimum (s=0.393) and a deeper global one (s=0.917)
    const h = (s) => 0.4 * Math.cos(s * 10.5 - 0.4) + 3 * (s - 0.78) * (s - 0.78);
    const X = (s) => x0 + (x1 - x0) * s, Y = (s) => yb - B * (0.35 + 2.0 * (h(s) + 0.34));
    ctx.strokeStyle = INK; lw(0.8);
    poly([[x0, yb], [x1, yb]], ease(seg(u, 0, 0.15))); poly([[x0, yb], [x0, cy - B * 3.4]], ease(seg(u, 0, 0.15)));
    const pts = []; for (let k = 0; k <= 200; k++) pts.push([X(k / 200), Y(k / 200)]);
    lw(1.3); poly(pts, ease(seg(u, 0.05, 0.35)));
    math([["f", ""], ["(", "up"], ["x", ""], [")", "up"]], x0 + B * 0.7, cy - B * 3.2, B * 0.5, ease(seg(u, 0.1, 0.3)));
    if (u < 0.35) return;
    const SL = 0.393, SG = 0.917, rr = B * 0.17;
    let bx, by;
    if (u < 0.66) {                       // roll into the nearby minimum
      const s = 0.02 + (SL - 0.02) * ease(seg(u, 0.35, 0.6));
      bx = X(s); by = Y(s) - rr;
    } else {                              // search escapes it and lands in the deeper one
      const a = ease(seg(u, 0.68, 0.84));
      ctx.globalAlpha = 0.35; dot(X(SL), Y(SL) - rr, rr, ACC); ctx.globalAlpha = 1;
      label("LOCAL", X(SL), Y(SL) + B * 0.5, B * 0.2, INK, "center", 0.6);
      const sx = X(SL), sy = Y(SL) - rr, ex = X(SG), ey = Y(SG) - rr;
      const arc = []; for (let k = 0; k <= 40; k++) { const t = k / 40; arc.push([sx + (ex - sx) * t, sy + (ey - sy) * t - Math.sin(Math.PI * t) * B * 2.4]); }
      ctx.strokeStyle = ACC; lw(1.2); ctx.setLineDash([B * 0.12, B * 0.12]); poly(arc, a); ctx.setLineDash([]);
      [bx, by] = pointOn(arc, a);
    }
    dot(bx, by, rr, ACC);
    if (u > 0.86) math([["x", ""], ["*", "sup"]], X(SG), Y(SG) + B * 0.6, B * 0.55);
  }

  function shotOptimize(u) {
    const tall = H > W;
    const o = stackOpts(0.3, 0); o.s = B * 1.75; o.cx = tall ? W / 2 : W / 2 - B * 1.6;
    if (tall) { o.s = B * 2.6; o.cy = H / 2 - B * 1.2; }
    const idx = Math.min(trace.length - 1, Math.floor(ease(seg(u, 0.05, 0.8)) * (genDone ? trace.length - 1 : trace.length - 1)));
    const fr = trace[Math.max(0, idx)];
    drawHeatStack(o, fr.temps, u, { tiles: fr.layout });
    const lx = tall ? W / 2 - B * 3.2 : W / 2 + B * 3.4, ly = tall ? H / 2 + B * 5 : H / 2 - B * 1.6;
    math([["T", ""], ["max", "sub"], [" = " + fr.peak.toFixed(2) + " K", "up"]], lx, ly, B * 0.62, 1, INK, "left");
    label("STEP " + String(Math.round(idx * 8)).padStart(3, "0") + " / 400" + (tall ? "" : " · BLOCKS MOVED ACROSS LAYERS"), lx, ly + B * 0.85, B * 0.2, INK, "left", 0.6);
    // sparkline of the peak
    const sx = lx, sy = ly + B * 2.6, sw = tall ? B * 6.4 : B * 4, sh = B * 1.1;
    ctx.strokeStyle = INK; lw(0.6); ctx.globalAlpha = 0.5; poly([[sx, sy], [sx + sw, sy]], 1); ctx.globalAlpha = 1;
    const pts = [];
    for (let i = 0; i <= idx; i++) pts.push([sx + sw * i / Math.max(1, trace.length - 1), sy - sh * (trace[i].peak - 30) / 26]);
    ctx.strokeStyle = ACC; lw(1.1); poly(pts, 1);
  }

  function shotSpin(u) {
    const o = stackOpts(u, 0); o.rot = -0.35 + u * 2.4; o.s = B * 1.8;
    drawHeatStack(o, trace[trace.length - 1].temps, u, {});
  }

  const mark = new Image(); mark.src = "swallowtail-mark.svg";
  function shotEnd(u) {
    const [cx, cy] = C();
    const a = ease(seg(u, 0, 0.3));
    ctx.save(); ctx.globalAlpha = a;
    if (mark.complete && mark.naturalWidth) {
      const s = B * 1.1;
      ctx.filter = "brightness(0) invert(1)";
      ctx.drawImage(mark, cx - s / 2, cy - B * 2.1, s, s * (mark.naturalHeight / mark.naturalWidth || 1));
      ctx.filter = "none";
    }
    ctx.font = B * 1.25 + "px " + SERIF; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = INK;
    ctx.fillText("Swallowtail", cx, cy + B * 0.15);
    ctx.restore();
    label("SOFTWARE-HARDWARE CO-DESIGN FOR 3D CHIPS", cx, cy + B * 1.35, B * 0.22, INK, "center", 0.75 * ease(seg(u, 0.2, 0.5)));
  }

  // ---------- timeline ----------
  const BPM = 128, BEAT = 60 / BPM * (reduce ? 1.8 : 1);
  const SHOTS = [
    { b: 2, f: shotSymbol(null, [["∇", "up"], ["T", ""]]) },
    { b: 4, f: shotWires },
    { b: 3, f: shotEq([["E", ""], ["move", "sub"], [" ≈ ", "up"], ["1000", "up"], [" E", ""], ["compute", "sub"]], 3) },
    { b: 1, f: shotSymbol(null, [["µ", "up"]]) },
    { b: 4, f: shotStack },
    { b: 1, f: shotSymbol(null, [["∂T", ""], ["/", "up"], ["∂t", ""]]) },
    { b: 5, f: shotHeat },
    { b: 3, f: shotPage, page: true },
    { b: 3, f: shotEq([["∇·(", "up"], ["k", ""], ["∇", "up"], ["T", ""], [") + ", "up"], ["q", ""], [" = 0", "up"]], null, 5) },
    { b: 1, f: shotSymbol(null, [["f", ""], ["⁻¹", "up"]]) },
    { b: 4, f: shotLoop },
    { b: 4, f: shotDescent },
    { b: 7, f: shotOptimize },
    { b: 3, f: shotEq([["x", ""], ["*", "sup"], [" = argmin", "up"], ["x", "sub"], [" f", ""], ["(", "up"], ["T", ""], ["(", "up"], ["x", ""], ["))", "up"]], 2) },
    { b: 2, f: shotSpin },
    { b: 6, f: shotEnd }
  ];
  const starts = []; { let t = 0; for (const s of SHOTS) { starts.push(t); t += s.b * BEAT; } }
  const LOOP = starts[starts.length - 1] + SHOTS[SHOTS.length - 1].b * BEAT;

  let t0 = performance.now(), paused = false, pauseAt = 0, skip = 0;
  function shotAt(t) {
    let i = SHOTS.length - 1;
    while (i > 0 && starts[i] > t) i--;
    return i;
  }

  function render(now) {
    pumpOptimizer();
    const tl = paused ? pauseAt : ((now - t0) / 1000 + skip) % LOOP;
    const i = shotAt(tl), sh = SHOTS[i];
    const local = tl - starts[i], dur = sh.b * BEAT, u = local / dur;
    const sinceBeat = (local % BEAT);
    const cutHit = reduce ? 0 : Math.max(0, 1 - local / 0.28);
    const beatHit = reduce ? 0 : Math.max(0, 1 - sinceBeat / 0.16) * 0.45;
    const hit = Math.max(cutHit, beatHit);
    const punch = 1 + 0.06 * cutHit * cutHit + 0.012 * beatHit;
    const shx = (Math.random() - 0.5) * B * 0.25 * hit, shy = (Math.random() - 0.5) * B * 0.18 * hit;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    BG = sh.page ? "#f3efe6" : "#000";
    ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
    const draw = (ink, acc, hl) => {
      INK = ink; ACC = acc; HL = hl;
      ctx.save();
      ctx.translate(W / 2 + shx, H / 2 + shy); ctx.scale(punch, punch); ctx.translate(-W / 2, -H / 2);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      sh.f(u);
      ctx.restore();
    };
    const split = hit * B * 0.16;
    if (split > 0.4 && !sh.page) {
      ctx.globalCompositeOperation = "lighter";
      ctx.save(); ctx.translate(-split, 0); draw("#ff0000", "#ff0000", "rgba(255,0,0,0.8)"); ctx.restore();
      ctx.save(); draw("#00ff00", "#00ff00", "rgba(0,255,0,0.8)"); ctx.restore();
      ctx.save(); ctx.translate(split, 0); draw("#0000ff", "#0000ff", "rgba(0,0,255,0.8)"); ctx.restore();
      ctx.globalCompositeOperation = "source-over";
    } else {
      draw(sh.page ? "#111" : "#fff", "#ff4a36", "rgba(255,221,51,0.9)");
    }
    requestAnimationFrame(render);
  }

  function setPaused(v) {
    const now = performance.now();
    if (v) pauseAt = ((now - t0) / 1000 + skip) % LOOP;
    else { t0 = now; skip = pauseAt; }
    paused = v;
    hint.textContent = paused ? "Paused · P to play" : hintText;
  }
  function jump(dir) {
    const now = performance.now();
    const tl = paused ? pauseAt : ((now - t0) / 1000 + skip) % LOOP;
    const i = (shotAt(tl) + dir + SHOTS.length) % SHOTS.length;
    t0 = now; skip = starts[i] + 0.001; if (paused) pauseAt = skip;
  }
  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "p" || e.key === "P") setPaused(!paused);
    else if (e.key === "f" || e.key === "F") { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); }
    else if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); jump(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); jump(-1); }
  });
  cv.addEventListener("click", () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {}); });
  window.SWT = { status: () => ({ n: trace.length, genDone, peak: trace[trace.length - 1].peak }), jump, setPaused, shots: SHOTS.length, at: (i, f = 0) => { t0 = performance.now(); skip = starts[i] + 0.001 + f * SHOTS[i].b * BEAT; pauseAt = skip; } };

  (document.fonts ? document.fonts.load("italic 40px \"STIX Two Text\"") : Promise.resolve()).finally(() => requestAnimationFrame(render));
})();
