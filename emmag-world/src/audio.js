// Everything is synthesised - no audio files to download or cache.
// Music is a slow I-V-vi-IV progression in D major with a pentatonic melody,
// scheduled on a lookahead clock so it stays in time.

const D4 = 293.66;
const hz = (semi) => D4 * Math.pow(2, semi / 12);
const CHORDS = [
  [0, 4, 7],    // D
  [7, 11, 14],  // A
  [9, 14, 18],  // Bm
  [5, 9, 12],   // G
];
const PENT = [0, 2, 4, 7, 9, 12, 14, 16];
const BEAT = 0.44;

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.beat = 0;
    this.timer = null;
  }

  start() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext;
    this.ctx = new C();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.42;
    this.master.connect(this.ctx.destination);
    this.bus = this.ctx.createBiquadFilter();
    this.bus.type = 'lowpass';
    this.bus.frequency.value = 2600;
    this.bus.connect(this.master);
    // cave echo: one feedback delay, wet gain ramped when she is underground
    const d = this.ctx.createDelay(1.2);
    d.delayTime.value = 0.33;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.4;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1500;
    this.wet = this.ctx.createGain();
    this.wet.gain.value = 0;
    this.bus.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d);
    lp.connect(this.wet); this.wet.connect(this.master);
    this.breeze();
    this.next = this.ctx.currentTime + 0.15;
    this.timer = setInterval(() => this.schedule(), 90);
  }

  setEcho(on) {
    if (!this.ctx || !this.wet) return;
    this.wet.gain.setTargetAtTime(on ? 0.45 : 0, this.ctx.currentTime, 0.25);
  }

  get t() { return this.ctx.currentTime; }

  // schedule a beat early enough that the audio clock, not setTimeout, is in charge
  schedule() {
    if (!this.ctx || this.muted) return;
    while (this.next < this.ctx.currentTime + 0.35) {
      this.playBeat(this.beat++, this.next);
      this.next += BEAT;
    }
  }

  playBeat(b, at) {
    const bar = Math.floor(b / 8) % CHORDS.length;
    const chord = CHORDS[bar];
    const inBar = b % 8;

    if (inBar === 0) {
      // warm pad on the chord root and fifth
      chord.slice(0, 2).forEach((s, i) => this.tone(hz(s - 12 + i * 5), at, BEAT * 8, 0.05, 'sine', 700));
      return;
    }
    // arpeggio: walk the chord, up an octave
    const s = chord[inBar % 3] + 12;
    this.tone(hz(s), at, BEAT * 0.9, 0.045, 'triangle', 2200);

    // melody on the off-beats, pentatonic, sparse
    if (inBar % 4 === 2) {
      const m = PENT[(b * 3) % PENT.length];
      this.tone(hz(m + 12), at + BEAT * 0.5, BEAT * 2.4, 0.05, 'sine', 1800);
    }
    if (Math.random() < 0.18) {
      const m = PENT[Math.floor(Math.random() * PENT.length)];
      this.tone(hz(m + 24), at + BEAT * 0.25, BEAT * 1.6, 0.018, 'sine', 3000);
    }
  }

  tone(freq, at, dur, vol, type = 'sine', cutoff = 2000) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = type;
    o.frequency.value = freq;
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(lp).connect(this.bus);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  // filtered noise bed: leaves moving
  breeze() {
    const c = this.ctx, len = c.sampleRate * 4;
    const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
    const g = c.createGain(); g.gain.value = 0.03;
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 0.018;
    lfo.connect(lg).connect(g.gain); lfo.start();
    src.connect(bp).connect(g).connect(this.master); src.start();
  }

  blip(freq, dur = 0.18, type = 'sine', vol = 0.22) {
    if (!this.ctx || this.muted) return;
    this.tone(freq, this.t + 0.01, dur, vol, type, 3000);
  }

  // one note of the world's own scale - used by the mushroom patch
  note(i) { this.blip(hz(PENT[i % PENT.length] + 12), 0.9, 'triangle', 0.16); }

  // surface: hollow on planks, gritty on gravel/sand, soft on grass
  step(surface = 'grass') {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, len = Math.floor(c.sampleRate * (surface === 'wood' ? 0.12 : 0.08));
    const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = c.createBufferSource(); src.buffer = buf;
    const lp = c.createBiquadFilter();
    lp.type = surface === 'gravel' ? 'bandpass' : 'lowpass';
    lp.frequency.value = surface === 'wood' ? 240 : surface === 'gravel' ? 1500 : 380;
    lp.Q.value = 0.9;
    const g = c.createGain(); g.gain.value = surface === 'wood' ? 0.09 : 0.07;
    src.connect(lp).connect(g).connect(this.master); src.start();
  }

  noise(dur, freq, q, vol, type = 'bandpass') {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, len = Math.max(64, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master); src.start();
  }

  lap(vol = 1) { this.noise(0.5, 520, 1.2, 0.05 * vol); }
  frog() { this.blip(190 + Math.random() * 40, 0.09, 'square', 0.05); setTimeout(() => this.blip(150 + Math.random() * 30, 0.12, 'square', 0.04), 110); }
  bird() { const f = 1900 + Math.random() * 900; this.blip(f, 0.08, 'sine', 0.05); setTimeout(() => this.blip(f * 1.25, 0.07, 'sine', 0.045), 90); setTimeout(() => this.blip(f * 0.9, 0.1, 'sine', 0.04), 190); }
  splash() { this.noise(0.4, 900, 0.8, 0.12); }
  wood() { this.blip(320, 0.12, 'triangle', 0.08); }

  gather(i = 0) { this.blip(hz(PENT[i % 3] + 12), 0.22, 'triangle', 0.2); }
  unlock() { [0, 4, 7, 12].forEach((s, i) => setTimeout(() => this.blip(hz(s + 12), 0.4, 'triangle', 0.18), i * 90)); }
  restore() { [0, 7, 12, 16].forEach((s) => this.blip(hz(s), 1.6, 'sine', 0.1)); }
  chime() { [12, 16, 19].forEach((s, i) => setTimeout(() => this.blip(hz(s), 1.2, 'sine', 0.09), i * 140)); }
  oops() { this.blip(hz(-5), 0.3, 'sine', 0.12); }
}
