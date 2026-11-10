/* Swallowtail toy thermal model. Classic script: exposes window.SwallowThermal (and module.exports in Node).
 *
 * Steady-state heat conduction in a stack of square dies on one cold plate, solved with
 * red-black SOR on a finite-volume grid. Temperatures are rises above coolant, in kelvin.
 *
 * Geometry and materials (stated so the numbers are honest, not calibrated to anything):
 *   die 8 mm x 8 mm, 32 x 32 cells (0.25 mm), silicon 100 um thick, k = 150 W/mK
 *   die-to-die bond layer 20 um, effective k = 5 W/mK (hybrid bond with copper vias)
 *   cold plate on the TOP die only (layer 0), effective h = 1e5 W/m^2K (liquid cold plate)
 *   "side by side": the same dies laid out flat, every die touching the cold plate.
 *
 * Floorplan: each die is a 4 x 4 grid of tiles (8 x 8 cells each). A layout assigns one tile type per slot,
 * slot index = layer*16 + row*4 + col. Tile powers in watts (TILE_TYPES).
 */
(function (root) {
  "use strict";

  const N = 32;              // cells per side
  const TILE = 8;            // cells per tile side
  const TPS = N / TILE;      // tiles per side (4)
  const CELL = 0.25e-3;      // m
  const T_SI = 100e-6, K_SI = 150;
  const T_BOND = 20e-6, K_BOND = 5;
  const H_PLATE = 1e5;
  const GL = K_SI * T_SI;                               // lateral conductance between neighbour cells (W/K); width/length cancel
  const GV = 1 / (T_SI / (K_SI * CELL * CELL) + T_BOND / (K_BOND * CELL * CELL)); // vertical, cell to cell through bond
  const GH = 1 / (T_SI / (2 * K_SI * CELL * CELL) + 1 / (H_PLATE * CELL * CELL)); // top die cell to coolant

  const TILE_TYPES = {
    core:  { label: "Core",  watts: 3.6 },
    accel: { label: "Accelerator", watts: 2.4 },
    io:    { label: "I/O",   watts: 1.0 },
    sram:  { label: "SRAM",  watts: 0.4 },
  };

  // One 2D floorplan (16 tiles) as a designer would draw it for a single die: hot cores clustered in the middle.
  const FLOORPLAN_2D = [
    "sram", "io",    "io",    "sram",
    "accel", "core", "core",  "accel",
    "accel", "core", "core",  "accel",
    "sram", "sram",  "sram",  "sram",
  ];

  function naiveStack(layers) {
    // Stack identical copies of the 2D floorplan, the default when a 2D design is simply stacked.
    const out = [];
    for (let l = 0; l < layers; l++) out.push(...FLOORPLAN_2D);
    return out;
  }

  function totalWatts(layout) {
    let w = 0;
    for (const t of layout) w += TILE_TYPES[t].watts;
    return w;
  }

  function powerMap(layout, layers) {
    const p = new Float64Array(layers * N * N);
    const perCell = 1 / (TILE * TILE);
    for (let l = 0; l < layers; l++)
      for (let ty = 0; ty < TPS; ty++)
        for (let tx = 0; tx < TPS; tx++) {
          const w = TILE_TYPES[layout[l * 16 + ty * TPS + tx]].watts * perCell;
          for (let y = 0; y < TILE; y++)
            for (let x = 0; x < TILE; x++) p[l * N * N + (ty * TILE + y) * N + tx * TILE + x] = w;
        }
    return p;
  }

  /** Solve steady state. mode "stacked" (default) or "flat" (side by side). Returns {temps, peak, mean, iters}. */
  function solve(layout, layers, opts = {}) {
    const mode = opts.mode || "stacked";
    const tol = opts.tol || 1e-4;
    const maxIter = opts.maxIter || 4000;
    const omega = opts.omega || 1.9;
    const P = powerMap(layout, layers);
    const T = opts.warm && opts.warm.length === P.length ? Float64Array.from(opts.warm) : new Float64Array(P.length);
    const NN = N * N;
    let iters = 0;
    for (; iters < maxIter; iters++) {
      let maxd = 0;
      for (let color = 0; color < 2; color++) {
        for (let l = 0; l < layers; l++) {
          const base = l * NN;
          const plate = mode === "flat" || l === 0;
          for (let y = 0; y < N; y++) {
            for (let x = (y + color) & 1; x < N; x += 2) {
              const i = base + y * N + x;
              let g = 0, s = P[i];
              if (x > 0) { g += GL; s += GL * T[i - 1]; }
              if (x < N - 1) { g += GL; s += GL * T[i + 1]; }
              if (y > 0) { g += GL; s += GL * T[i - N]; }
              if (y < N - 1) { g += GL; s += GL * T[i + N]; }
              if (mode === "stacked") {
                if (l > 0) { g += GV; s += GV * T[i - NN]; }
                if (l < layers - 1) { g += GV; s += GV * T[i + NN]; }
              }
              if (plate) g += GH; // coolant at 0
              const nv = T[i] + omega * (s / g - T[i]);
              const d = Math.abs(nv - T[i]);
              if (d > maxd) maxd = d;
              T[i] = nv;
            }
          }
        }
      }
      if (maxd < tol) break;
    }
    let peak = 0, sum = 0;
    for (let i = 0; i < T.length; i++) { if (T[i] > peak) peak = T[i]; sum += T[i]; }
    return { temps: T, peak, mean: sum / T.length, iters, layers, n: N };
  }

  /** Peak per layer, handy for labels. */
  function layerPeaks(res) {
    const NN = N * N, out = [];
    for (let l = 0; l < res.layers; l++) {
      let m = 0;
      for (let i = 0; i < NN; i++) if (res.temps[l * NN + i] > m) m = res.temps[l * NN + i];
      out.push(m);
    }
    return out;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Inverse design by simulated annealing over tile swaps (any slot, any layer), minimising peak temperature.
   * Every candidate is scored by the solver above, so the curve is real. Deterministic for a given seed.
   * Returns an iterator: call next() repeatedly (e.g. a few per animation frame). Each value:
   *   { step, layout, peak, best, bestLayout, accepted, swap:[i,j], temps }
   */
  function* optimize(startLayout, layers, opts = {}) {
    const steps = opts.steps || 400;
    const rand = mulberry32(opts.seed || 7);
    let cur = startLayout.slice();
    let res = solve(cur, layers);
    let best = res.peak, bestLayout = cur.slice(), bestTemps = res.temps;
    let temp0 = opts.t0 || 2.0;
    for (let step = 1; step <= steps; step++) {
      const i = Math.floor(rand() * cur.length);
      let j = Math.floor(rand() * cur.length);
      if (cur[i] === cur[j]) { j = (j + 1 + Math.floor(rand() * (cur.length - 1))) % cur.length; }
      if (cur[i] === cur[j]) { yield { step, layout: cur, peak: res.peak, best, bestLayout, accepted: false, swap: [i, j], temps: res.temps }; continue; }
      const cand = cur.slice();
      [cand[i], cand[j]] = [cand[j], cand[i]];
      const r2 = solve(cand, layers, { warm: res.temps, tol: 2e-4 });
      const T = temp0 * (1 - step / steps) + 1e-3;
      const accept = r2.peak < res.peak || rand() < Math.exp((res.peak - r2.peak) / T);
      if (accept) { cur = cand; res = r2; }
      if (res.peak < best) { best = res.peak; bestLayout = cur.slice(); bestTemps = res.temps; }
      yield { step, layout: cur, peak: res.peak, best, bestLayout, bestTemps, accepted: accept, swap: [i, j], temps: res.temps };
    }
  }

  const api = { N, TILE, TPS, TILE_TYPES, FLOORPLAN_2D, naiveStack, totalWatts, powerMap, solve, layerPeaks, optimize,
    constants: { CELL, T_SI, K_SI, T_BOND, K_BOND, H_PLATE, GL, GV, GH } };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SwallowThermal = api;
})(typeof window !== "undefined" ? window : globalThis);
