/* Swallowtail edit soundtrack: synthesized live with Web Audio, no audio files.
   A dark 128 bpm phonk-style loop scheduled against the edit's own timeline, so every
   cut lands on a hit. Starts on the first click or key press (browsers block autoplay). */
(() => {
  "use strict";
  let ac = null, master = null, tone = null, bus = null, noiseBuf = null, dist = null;
  let on = false, beats = 0;

  // D minor, one chord root per bar: Dm, Bb, Gm, A
  const ROOTS = [36.71, 29.14, 24.5, 27.5];             // D1, Bb0, G0, A0 (Hz), 808 lives here
  const BELL = [880, 0, 880, 0, 698.5, 0, 880, 0, 784, 0, 698.5, 0, 659.3, 0, 587.3, 0,
                880, 0, 880, 0, 698.5, 0, 1046.5, 0, 932.3, 0, 880, 0, 784, 0, 698.5, 0];

  function init() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0.0001;
    tone = ac.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 18000; tone.Q.value = 0.5;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    bus = ac.createGain(); bus.gain.value = 1;
    bus.connect(tone); tone.connect(comp); comp.connect(master); master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    dist = ac.createWaveShaper();
    const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; c[i] = Math.tanh(x * 3.2); }
    dist.curve = c; dist.connect(bus);
  }

  const env = (g, t, a, peak, dec) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); };
  function osc(type, f, t, dur, peak, dest = bus, a = 0.002) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); o.connect(g); g.connect(dest);
    env(g, t, a, peak, dur); o.start(t); o.stop(t + a + dur + 0.05); return o;
  }
  function noise(t, dur, peak, type, f, q = 0.7, dest = bus) {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    s.connect(fl); fl.connect(g); g.connect(dest); env(g, t, 0.002, peak, dur);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05); return fl;
  }

  function kick(t, big) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(big ? 180 : 150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    o.connect(g); g.connect(bus); env(g, t, 0.001, big ? 1 : 0.85, big ? 0.45 : 0.3); o.start(t); o.stop(t + 0.6);
    noise(t, 0.02, 0.3, "highpass", 2500);
  }
  function clap(t) { for (let k = 0; k < 3; k++) noise(t + k * 0.011, k === 2 ? 0.16 : 0.02, 0.45, "bandpass", 1300, 1.2); }
  function hat(t, open) { noise(t, open ? 0.14 : 0.035, open ? 0.16 : 0.11, "highpass", 8000); }
  function bass(t, f, beats, BEAT) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(f * 2.2, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    o.connect(g); g.connect(dist);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + beats * BEAT * 0.95);
    o.start(t); o.stop(t + beats * BEAT + 0.1);
  }
  function bell(t, f) {
    const g = ac.createGain(), bp = ac.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = f * 1.5; bp.Q.value = 2.5; g.connect(bp); bp.connect(bus);
    env(g, t, 0.001, 0.16, 0.16);
    for (const m of [1, 1.4836]) { const o = ac.createOscillator(); o.type = "square"; o.frequency.value = f * m; o.connect(g); o.start(t); o.stop(t + 0.25); }
  }
  function impact(t) {                                   // the cut: boom + crash + sub drop
    kick(t, true);
    noise(t, 1.1, 0.35, "highpass", 3000);
    noise(t, 0.35, 0.5, "lowpass", 500);
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.9);
    o.connect(g); g.connect(dist); env(g, t, 0.003, 0.5, 0.9); o.start(t); o.stop(t + 1);
  }
  function riser(t, dur) {
    const fl = noise(t, dur, 0.22, "bandpass", 400, 3);
    fl.frequency.exponentialRampToValueAtTime(7000, t + dur);
  }
  function pad(t, f, dur) {                               // dark minor chord for the end card
    for (const m of [2, 2.378, 3, 4]) {
      const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
      o.type = "sawtooth"; o.frequency.value = f * m; o.detune.value = (Math.random() - 0.5) * 14;
      lp.type = "lowpass"; lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(1400, t + dur * 0.4); lp.frequency.linearRampToValueAtTime(200, t + dur);
      o.connect(lp); lp.connect(g); g.connect(bus);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }

  // One beat of the arrangement. kind comes from the shot table in edit.js.
  function beat(t, info, BEAT) {
    const { g, j, kind, b, last } = info;               // g = beat in loop, j = beat in shot
    const root = ROOTS[Math.floor(g / 4) % 4];
    const cut = j === 0;
    if (kind === "end") {
      if (cut) { impact(t); bass(t, ROOTS[0], 3, BEAT); pad(t, ROOTS[0] * 4, b * BEAT); }
      if (j === b - 2) riser(t, BEAT * 2);
      return;
    }
    if (kind === "flash") { impact(t); bass(t, root, b, BEAT); return; }
    if (cut) { impact(t); bass(t, root, Math.min(2, b), BEAT); }
    else { kick(t, false); if (j % 2 === 0) bass(t, root, 1, BEAT); }
    if (g % 2 === 1 && kind !== "page") clap(t);
    const sixteen = kind === "build" || kind === "full";
    for (let s = 0; s < 4; s++) {
      const ts = t + s * BEAT / 4;
      if (s === 2) hat(ts, g % 4 === 3);
      else if (sixteen && s !== 0) hat(ts, false);
      if ((kind === "full" || kind === "build") && BELL[(g * 4 + s) % 32]) bell(ts, BELL[(g * 4 + s) % 32]);
    }
    if (kind === "build" && last) riser(t, BEAT);
  }

  // ---- clock sync: map the edit's timeline (seconds in loop) to the audio clock ----
  let anchorA = 0, anchorT = 0, next = 0, synced = false, lastSched = -1;
  function tick(tl, paused, plan) {
    if (!on || !ac) return;
    const { BEAT, LOOP, beatInfo } = plan;
    const NB = Math.round(LOOP / BEAT);
    if (paused) { synced = false; return; }
    const now = ac.currentTime;
    if (synced) {
      const exp = (anchorT + (now - anchorA)) % LOOP;
      let d = Math.abs(exp - tl); d = Math.min(d, LOOP - d);
      if (d > 0.08) synced = false;                       // a jump, a resume or drift: re-anchor
    }
    if (!synced) {
      anchorA = now; anchorT = tl; next = Math.ceil(tl / BEAT - 1e-6); synced = true;
    }
    const horizon = now + 0.3;
    for (;;) {
      const at = anchorA + (next * BEAT - anchorT);
      if (at > horizon) break;
      if (at >= now - 0.01 && at > lastSched + BEAT * 0.5) { beat(Math.max(at, now), beatInfo(next % NB), BEAT); lastSched = at; beats++; }
      next++;
    }
  }

  function setTone(page) {
    if (!ac) return;
    tone.frequency.setTargetAtTime(page ? 650 : 18000, ac.currentTime, 0.04);
  }

  function enable(v) {
    if (v && !ac) init();
    if (!ac) return;
    on = v;
    if (v) { ac.resume(); synced = false; lastSched = -1; }
    master.gain.cancelScheduledValues(ac.currentTime);
    master.gain.setTargetAtTime(v ? 0.8 : 0.0001, ac.currentTime, 0.03);
  }

  window.SwallowSound = { enable, tick, setTone, get on() { return on; }, get started() { return !!ac; }, debug: () => ({ state: ac && ac.state, beats, t: ac && ac.currentTime }) };
})();
