// Every sound in NEON HARBOR is synthesized with WebAudio: no audio files exist.
// An engine hum follows the player's car, a two-tone siren swells as police close
// in, and shots, crashes, chimes and clicks are shaped noise and oscillators.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.padOscillators = [];
  }

  /** Create the context on the first user gesture and start the ambient pad. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    this.startPad();
    this.startEngine();
    this.startSiren();
  }

  /** M toggles this: silence or restore the master gain. */
  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.55;
  }

  /** A slow warm chord under everything: two detuned triangles through a lowpass. */
  startPad() {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0.035;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    for (const freq of [110, 164.8, 220, 277.2]) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = (freq % 7) - 3;
      osc.connect(filter);
      osc.start();
      this.padOscillators.push(osc);
    }
    filter.connect(gain);
    gain.connect(this.master);
  }

  /** The engine: a sawtooth whose pitch and volume follow the driven car. */
  startEngine() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 40;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    this.engineFilter = filter;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  /** Call every frame: speedRatio 0..1, active only while the player drives. */
  updateEngine(speedRatio, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = active ? 0.05 + speedRatio * 0.08 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.09);
    this.engineOsc.frequency.setTargetAtTime(45 + speedRatio * 130, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(350 + speedRatio * 900, t, 0.1);
  }

  /** The police siren: a square wave alternating two tones, silent when no cop is near. */
  startSiren() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 700;
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 2;
    this.sirenOsc.connect(filter);
    filter.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
  }

  /** Call every frame with the distance to the nearest police car. */
  updateSiren(nearestCopDistance, wantedStars) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    let level = 0;
    if (wantedStars > 0 && nearestCopDistance < 90) {
      level = 0.028 * (1 - nearestCopDistance / 90) + 0.004;
    }
    this.sirenGain.gain.setTargetAtTime(level, t, 0.15);
    if (level > 0) {
      const twoTone = Math.floor(t * 1.6) % 2 === 0;
      this.sirenOsc.frequency.setValueAtTime(twoTone ? 660 : 880, t);
    }
  }

  /** A short shaped noise burst: the basis of shots, crashes and thuds. */
  noiseBurst(duration, volume, filterFreq, type = 'lowpass') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
  }

  /** One sine blip with an exponential decay. */
  blip(freq, duration, volume, type = 'sine', when = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    const start = ctx.currentTime + when;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /** Pistol shot: a crack of noise over a low thump. */
  gunshot() {
    this.noiseBurst(0.14, 0.5, 2600, 'highpass');
    this.noiseBurst(0.2, 0.4, 300);
  }

  /** Empty click when the magazine is dry. */
  dryFire() {
    this.blip(1400, 0.05, 0.12, 'square');
  }

  /** Two mechanical clicks: magazine out, magazine in. */
  reload() {
    this.blip(500, 0.05, 0.15, 'square');
    this.blip(340, 0.05, 0.15, 'square', 0.16);
    this.blip(720, 0.06, 0.18, 'square', 0.34);
  }

  /** Bodywork meeting something solid, scaled by impact 0..1. */
  crash(intensity) {
    this.noiseBurst(0.25, 0.15 + intensity * 0.4, 500);
    this.blip(70, 0.22, 0.2 * intensity, 'sine');
  }

  /** The cash register of crime: mission money landing. */
  cashChime() {
    this.blip(880, 0.16, 0.16, 'sine');
    this.blip(1318, 0.3, 0.16, 'sine', 0.09);
  }

  /** A short rising sting when a mission starts. */
  missionSting() {
    this.blip(392, 0.14, 0.12, 'triangle');
    this.blip(523, 0.14, 0.12, 'triangle', 0.1);
    this.blip(659, 0.24, 0.12, 'triangle', 0.2);
  }

  /** A low falling tone for BUSTED and WASTED. */
  failTone() {
    this.blip(220, 0.4, 0.18, 'sawtooth');
    this.blip(155, 0.6, 0.18, 'sawtooth', 0.25);
  }

  /** Menu and button clicks. */
  click() {
    this.blip(950, 0.05, 0.1, 'square');
  }

  /** Stepping into a marker: a soft pickup shimmer. */
  pickup() {
    this.blip(1046, 0.12, 0.12, 'sine');
    this.blip(1568, 0.2, 0.1, 'sine', 0.06);
  }
}
