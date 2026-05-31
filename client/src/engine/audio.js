// Procedural audio — everything synthesized in the browser with Web Audio.
// No downloaded sound files = nothing to 404, and it nails the Backrooms drone.
export class AudioEngine {
  constructor() { this.ctx = null; this.ready = false; this.nodes = {}; }

  // Must be called from a user gesture (browser autoplay policy).
  start() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    const master = ctx.createGain(); master.gain.value = 0.0; master.connect(ctx.destination);
    this.master = master;
    this._buildHum();
    this.ready = true;
    // Fade the world in.
    master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 2.5);
  }

  // The signature fluorescent-light buzz: a 60Hz-ish bed + a thin high whine + room tone.
  _buildHum() {
    const ctx = this.ctx;
    const bus = ctx.createGain(); bus.gain.value = 0.16; bus.connect(this.master);

    const mains = ctx.createOscillator(); mains.type = 'sawtooth'; mains.frequency.value = 60;
    const mg = ctx.createGain(); mg.gain.value = 0.05;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140;
    mains.connect(lp); lp.connect(mg); mg.connect(bus); mains.start();

    const whine = ctx.createOscillator(); whine.type = 'sine'; whine.frequency.value = 5400;
    const wg = ctx.createGain(); wg.gain.value = 0.006;
    whine.connect(wg); wg.connect(bus); whine.start();

    // Slow amplitude wobble so it feels alive / sickly.
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.12;
    const lfg = ctx.createGain(); lfg.gain.value = 0.03;
    lfo.connect(lfg); lfg.connect(bus.gain); lfo.start();

    // Brown-noise room tone.
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0); let last = 0;
    for (let i = 0; i < d.length; i++) { const w = (Math.random() * 2 - 1) * 0.5; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
    noise.buffer = buf; noise.loop = true;
    const ng = ctx.createGain(); ng.gain.value = 0.05;
    const nlp = ctx.createBiquadFilter(); nlp.type = 'lowpass'; nlp.frequency.value = 600;
    noise.connect(nlp); nlp.connect(ng); ng.connect(bus); noise.start();

    this.nodes.humBus = bus; this.nodes.mains = mains;
  }

  footstep() {
    if (!this.ready) return; const ctx = this.ctx; const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = 0.08;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
  }

  heartbeat(intensity = 1) {
    if (!this.ready) return; const ctx = this.ctx; const t = ctx.currentTime;
    for (const off of [0, 0.18]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 55;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t + off);
      g.gain.exponentialRampToValueAtTime(0.18 * intensity, t + off + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.18);
      o.connect(g); g.connect(this.master); o.start(t + off); o.stop(t + off + 0.2);
    }
  }

  // Dissonant sting when an entity strikes / appears.
  sting() {
    if (!this.ready) return; const ctx = this.ctx; const t = ctx.currentTime;
    [180, 190, 410].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
      const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = f * 2; flt.Q.value = 4;
      o.connect(flt); flt.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1.25);
    });
  }

  pickup() {
    if (!this.ready) return; const ctx = this.ctx; const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(880, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.3);
  }

  // A wet, rattling exhale — call repeatedly as the monster nears for a breathing presence.
  breath(intensity = 1) {
    if (!this.ready) return; const ctx = this.ctx; const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.9, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const env = Math.sin((i / d.length) * Math.PI);          // inhale-exhale swell
      d[i] = (Math.random() * 2 - 1) * env * env;
    }
    src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 480 + intensity * 300; bp.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.value = 0.0;
    g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.09 * intensity, t + 0.3); g.gain.linearRampToValueAtTime(0, t + 0.9);
    src.connect(bp); bp.connect(g); g.connect(this.master); src.start(t);
  }

  // Distant, unsettling ambience — something else is in here with you, far off.
  // Heavily low-passed + quiet + slightly delayed so it reads as "somewhere else".
  ambientEvent() {
    if (!this.ready) return; const ctx = this.ctx; const t = ctx.currentTime;
    const kinds = ['thud', 'footsteps', 'groan', 'creak'];
    const kind = kinds[Math.floor(this._rand() * kinds.length)];

    // shared "far away" chain: lowpass + a little delay/feedback for space, quiet bus
    const bus = ctx.createGain(); bus.gain.value = 0.0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const delay = ctx.createDelay(); delay.delayTime.value = 0.16;
    const fb = ctx.createGain(); fb.gain.value = 0.35;
    bus.connect(lp); lp.connect(this.master); lp.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(this.master);

    const noiseBurst = (dur, freq, gain, when) => {
      const src = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * dur), ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
      src.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.5;
      const g = ctx.createGain(); g.gain.value = gain;
      src.connect(bp); bp.connect(g); g.connect(bus); src.start(when);
    };

    if (kind === 'thud') { noiseBurst(0.25, 90, 0.5, t); }
    else if (kind === 'footsteps') { for (let i = 0; i < 4; i++) noiseBurst(0.08, 140 + Math.random() * 60, 0.28, t + i * 0.34); }
    else if (kind === 'creak') {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.9);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + 1.05);
    } else { // groan
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 62 + this._rand() * 20;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5; const lg = ctx.createGain(); lg.gain.value = 6; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + 1.8);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + 1.85);
    }
    // fade the bus in/out so nothing clicks
    bus.gain.setValueAtTime(0.0001, t); bus.gain.linearRampToValueAtTime(0.5, t + 0.05);
    bus.gain.setTargetAtTime(0.0001, t + 2.0, 0.6);
    return kind;
  }

  _rand() { return Math.random(); }

  setTension(x) { // 0..1 — raises the hum when danger is near.
    if (!this.ready) return;
    this.nodes.humBus.gain.setTargetAtTime(0.16 + x * 0.5, this.ctx.currentTime, 0.5);
    this.nodes.mains.frequency.setTargetAtTime(60 + x * 8, this.ctx.currentTime, 0.5);
  }
}
