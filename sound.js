/* Swallowtail edit soundtrack: synthesized live with Web Audio, no audio files.
   Dark 128 bpm techno scheduled against the edit's own timeline, so every cut lands on a
   hit. Starts on the first click or key press (browsers block autoplay). */
(() => {
  "use strict";
  let ac = null, master = null, tone = null, bus = null, duck = null, echo = null, noiseBuf = null, dist = null;
  let on = false, beats = 0, meter = null;

  const D2 = 73.42;
  const ROOTS = [0, 0, -4, -2];                          // semitones from D, one per bar: D D Bb C
  // 303-style acid line, 16 steps per bar: semitone offsets, null = rest, "+" marks an accent
  const ACID = [0, null, 12, 0, "+3", null, 0, 15, 0, "+7", null, 0, "+10", 0, 3, 5];
  const st = (n) => Math.pow(2, n / 12);

  function init() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0.0001;
    tone = ac.createBiquadFilter(); tone.type = "lowpass"; tone.frequency.value = 18000; tone.Q.value = 0.5;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.12;
    bus = ac.createGain();
    bus.connect(tone); tone.connect(comp); comp.connect(master); master.connect(ac.destination);
    meter = ac.createAnalyser(); meter.fftSize = 2048; master.connect(meter);
    duck = ac.createGain(); duck.connect(bus);              // everything but the kick pumps against it
    dist = ac.createWaveShaper();
    const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; c[i] = Math.tanh(x * 2.6); }
    dist.curve = c; dist.connect(duck);
    // dotted-eighth echo for stabs and acid
    echo = ac.createGain(); const dl = ac.createDelay(2), fb = ac.createGain(), lp = ac.createBiquadFilter();
    dl.delayTime.value = (60 / 128) * 0.75; fb.gain.value = 0.38; lp.type = "lowpass"; lp.frequency.value = 2200;
    echo.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(duck);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  const env = (g, t, a, peak, dec) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); };
  function noise(t, dur, peak, type, f, q = 0.7, dest = bus) {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    s.connect(fl); fl.connect(g); g.connect(dest); env(g, t, 0.002, peak, dur);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05); return fl;
  }

  function pump(t, BEAT) {                                // sidechain duck on every kick
    duck.gain.cancelScheduledValues(t);
    duck.gain.setValueAtTime(0.25, t); duck.gain.linearRampToValueAtTime(1, t + BEAT * 0.55);
  }
  function kick(t, hard) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(hard ? 210 : 165, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.07);
    o.connect(g); g.connect(bus); env(g, t, 0.001, 1, hard ? 0.5 : 0.32); o.start(t); o.stop(t + 0.6);
    noise(t, 0.012, 0.35, "highpass", 3500);
  }
  function rumble(t, f, BEAT) {                            // rolling offbeat sub, techno rumble
    for (const k of [1, 2, 3]) {
      const ts = t + k * BEAT / 4, o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
      o.type = "sawtooth"; o.frequency.value = f; lp.type = "lowpass"; lp.frequency.value = 180; lp.Q.value = 3;
      o.connect(lp); lp.connect(g); g.connect(dist); env(g, ts, 0.004, k === 2 ? 0.5 : 0.32, BEAT / 4 * 0.85);
      o.start(ts); o.stop(ts + BEAT / 4 + 0.05);
    }
  }
  function clap(t) { for (let k = 0; k < 4; k++) noise(t + k * 0.009, k === 3 ? 0.22 : 0.015, 0.5, "bandpass", 1500, 1.4); }
  function hat(t, open, v = 1) { noise(t, open ? 0.12 : 0.03, (open ? 0.2 : 0.09) * v, "highpass", open ? 7000 : 9500, 0.9, duck); }
  function ride(t) { noise(t, 0.3, 0.05, "bandpass", 6500, 2.5, duck); }
  function acid(t, f, accent, cut, BEAT) {
    const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    o.type = "sawtooth"; o.frequency.value = f;
    lp.type = "lowpass"; lp.Q.value = 16;
    lp.frequency.setValueAtTime(cut * (accent ? 5 : 3), t); lp.frequency.exponentialRampToValueAtTime(cut, t + 0.11);
    o.connect(lp); lp.connect(g); g.connect(dist); g.connect(echo);
    env(g, t, 0.003, accent ? 0.2 : 0.12, BEAT / 4 * 0.9); o.start(t); o.stop(t + BEAT / 4 + 0.05);
  }
  function stab(t, f) {                                    // minor chord stab into the echo
    const g = ac.createGain(), bp = ac.createBiquadFilter();
    bp.type = "lowpass"; bp.frequency.setValueAtTime(3200, t); bp.frequency.exponentialRampToValueAtTime(500, t + 0.25); bp.Q.value = 4;
    g.connect(bp); bp.connect(duck); bp.connect(echo); env(g, t, 0.002, 0.09, 0.28);
    for (const m of [1, 1.189, 1.498, 2]) for (const dt of [-8, 8]) {
      const o = ac.createOscillator(); o.type = "sawtooth"; o.frequency.value = f * m; o.detune.value = dt;
      o.connect(g); o.start(t); o.stop(t + 0.35);
    }
  }
  function crash(t) { noise(t, 1.4, 0.28, "highpass", 4500); noise(t, 0.25, 0.4, "lowpass", 400); }
  function riser(t, dur) {
    const fl = noise(t, dur, 0.25, "bandpass", 300, 4);
    fl.frequency.exponentialRampToValueAtTime(9000, t + dur);
  }
  function pad(t, f, dur) {                                // breakdown chord for the end card
    for (const m of [1, 1.189, 1.498, 2, 3]) {
      const o = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
      o.type = "sawtooth"; o.frequency.value = f * m; o.detune.value = (Math.random() - 0.5) * 16;
      lp.type = "lowpass"; lp.frequency.setValueAtTime(250, t); lp.frequency.linearRampToValueAtTime(1800, t + dur * 0.6); lp.frequency.linearRampToValueAtTime(300, t + dur);
      o.connect(lp); lp.connect(g); g.connect(bus);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.1);
    }
  }

  // One beat of the arrangement. kind comes from the shot table in edit.js.
  function beat(t, info, BEAT) {
    const { g, j, kind, b, last } = info;                 // g = beat in loop, j = beat in shot
    const root = D2 * st(ROOTS[Math.floor(g / 4) % 4]);
    const cut = j === 0;
    if (kind === "end") {                                  // breakdown: no kick, chord swells, riser back in
      if (cut) { kick(t, true); crash(t); stab(t, D2 * 2); pad(t, D2 * 2, b * BEAT); }
      if (j === b - 2) riser(t, BEAT * 2);
      if (j >= b - 1) for (let s = 0; s < 4; s++) clap(t + s * BEAT / 4);
      return;
    }
    kick(t, cut); pump(t, BEAT);
    if (cut) { crash(t); stab(t, root * 2); }
    if (kind !== "flash") rumble(t, root, BEAT);
    const busy = kind === "full" || kind === "build";
    if (g % 2 === 1 && kind !== "intro") clap(t);
    for (let s = 0; s < 4; s++) {
      const ts = t + s * BEAT / 4;
      if (s === 2) hat(ts, true);
      else if (busy) hat(ts, false, s === 0 ? 0.6 : 1);
      if (busy && s % 2 === 0) ride(ts);
      if (busy || kind === "page") {
        const step = ACID[(g * 4 + s) % 16];
        if (step !== null) {
          const accent = typeof step === "string", n = accent ? +step : step;
          // the filter opens across the live search, then sits bright for the rest of the edit
          const open = kind === "build" ? 300 + 1500 * (j + s / 4) / b : 650;
          acid(ts, root * 2 * st(n), accent, open, BEAT);
        }
      }
    }
    if (kind === "build" && j >= b - 2) for (let s = 0; s < 4; s++) clap(t + s * BEAT / 4);
    if (kind === "build" && j === b - 2) riser(t, BEAT * 2);
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

  window.SwallowSound = { enable, tick, setTone, get on() { return on; }, get started() { return !!ac; }, debug: () => { let peak = 0; if (meter) { const a = new Float32Array(meter.fftSize); meter.getFloatTimeDomainData(a); for (const v of a) peak = Math.max(peak, Math.abs(v)); } return { state: ac && ac.state, beats, t: ac && ac.currentTime, peak }; } };
})();
