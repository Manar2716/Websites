/* Sound.
 *
 * Every sound in this game is synthesised in the browser when it plays.
 * There is not a single audio file, which means nothing to download,
 * nothing to decode on a slow phone, and no licensing question about where
 * a gunshot came from — the whole bank is a few hundred lines of maths.
 *
 * A gunshot here is three layers, which is roughly what one is: a click
 * transient for the mechanism, a filtered noise burst for the blast, and a
 * short low body that gives it weight. Changing a weapon's character is a
 * matter of moving the filter and the decay, and that is exactly what the
 * `sound` block on each weapon does.
 *
 * Positioning is stereo pan plus distance attenuation rather than the
 * WebAudio panner node: with sixteen players firing, HRTF panning is the
 * single most expensive thing on the audio thread and the difference is
 * inaudible over a phone speaker.
 */

const MAX_VOICES = 22;

export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.voices = 0;
    this.settings = { master: 0.8, effects: 1.0, music: 0.35, ui: 0.8 };
    this._noise = null;
    this._pending = [];
  }

  /* Browsers refuse to start audio without a gesture, so this is called
     from the first tap or key press rather than at load. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch { return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.settings.master;
    this.master.connect(c.destination);

    this.busFx = c.createGain();
    this.busFx.gain.value = this.settings.effects;
    this.busUi = c.createGain();
    this.busUi.gain.value = this.settings.ui;
    this.busMusic = c.createGain();
    this.busMusic.gain.value = this.settings.music;

    /* A gentle limiter on the effects bus. Sixteen players firing at once
       otherwise clips hard enough to sound broken. */
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -12;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 10;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.18;
    this.busFx.connect(this.limiter);
    this.limiter.connect(this.master);
    this.busUi.connect(this.master);
    this.busMusic.connect(this.master);

    this._noise = makeNoise(c, 2.0);
    this.ready = true;
    if (c.state === 'suspended') c.resume();
  }

  setVolumes(v) {
    Object.assign(this.settings, v);
    if (!this.ready) return;
    this.master.gain.value = this.settings.master;
    this.busFx.gain.value = this.settings.effects;
    this.busUi.gain.value = this.settings.ui;
    this.busMusic.gain.value = this.settings.music;
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }

  /* Voice budget. Dropping the seventeenth simultaneous gunshot is
     inaudible; letting it through on a weak phone is a frame hitch. */
  _voice() {
    if (!this.ready || this.voices >= MAX_VOICES) return false;
    this.voices++;
    setTimeout(() => { this.voices--; }, 400);
    return true;
  }

  _out(pan, gain, bus) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = gain;
    if (c.createStereoPanner && pan !== undefined) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      p.connect(bus || this.busFx);
    } else {
      g.connect(bus || this.busFx);
    }
    return g;
  }

  _noiseSrc(rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(this.now + Math.random() * 0.001, Math.random() * 1.5);
    return s;
  }

  /* ── Weapons ───────────────────────────────────────────────────── */
  shot(sound, opts = {}) {
    if (!this._voice()) return;
    const c = this.ctx, t = this.now;
    const { pan = 0, distance = 0, volume = 1 } = opts;
    const s = sound || { type: 'crack', pitch: 1, punch: 0.8 };
    /* Distance does three things at once: quieter, later, and duller.
       The low-pass is what makes a far-off firefight sound far off. */
    const atten = 1 / (1 + distance * distance * 0.0045);
    const level = volume * atten * (opts.own ? 1 : 0.85);
    if (level < 0.004) return;
    const delay = Math.min(0.45, distance / 340);
    const t0 = t + delay;
    const out = this._out(pan, level, this.busFx);

    const P = { crack: [2100, 0.10], snap: [3000, 0.07], boom: [900, 0.22], thud: [700, 0.11], swipe: [4200, 0.06] };
    const [centre, tail] = P[s.type] || P.crack;
    const pitch = s.pitch || 1;
    const punch = s.punch === undefined ? 0.8 : s.punch;

    // 1. Blast: filtered noise with a fast exponential decay.
    const n = this._noiseSrc(1 + Math.random() * 0.15);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = centre * pitch;
    bp.Q.value = 0.8;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.max(700, 15000 - distance * 190);
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.9 * punch, t0);
    ng.gain.exponentialRampToValueAtTime(0.0008, t0 + tail * (1 + distance * 0.02));
    n.connect(bp); bp.connect(lp); lp.connect(ng); ng.connect(out);
    n.stop(t0 + tail * 2 + 0.1);

    // 2. Body: a short pitched-down sine, the part you feel more than hear.
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180 * pitch, t0);
    o.frequency.exponentialRampToValueAtTime(48 * pitch, t0 + tail * 1.4);
    const og = c.createGain();
    og.gain.setValueAtTime(0.55 * punch, t0);
    og.gain.exponentialRampToValueAtTime(0.0008, t0 + tail * 1.6);
    o.connect(og); og.connect(out);
    o.start(t0); o.stop(t0 + tail * 2 + 0.05);

    // 3. Mechanism: a bright tick, only audible close up.
    if (distance < 26) {
      const k = this._noiseSrc(1.9);
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 4200;
      const kg = c.createGain();
      kg.gain.setValueAtTime(0.35 * (1 - distance / 26), t0);
      kg.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.03);
      k.connect(hp); hp.connect(kg); kg.connect(out);
      k.stop(t0 + 0.06);
    }

    // 4. Tail: a slap of reverb-ish noise for indoor maps.
    if (opts.reverb && distance < 60) {
      const r = this._noiseSrc(0.6);
      const rf = c.createBiquadFilter();
      rf.type = 'lowpass';
      rf.frequency.value = 1400;
      const rg = c.createGain();
      rg.gain.setValueAtTime(0.0001, t0 + 0.02);
      rg.gain.linearRampToValueAtTime(0.12 * punch * opts.reverb, t0 + 0.05);
      rg.gain.exponentialRampToValueAtTime(0.0004, t0 + 0.42);
      r.connect(rf); rf.connect(rg); rg.connect(out);
      r.stop(t0 + 0.5);
    }
  }

  dryFire() { this.click(2600, 0.035, 0.25); }

  /* Reloads are a little sequence of mechanical noises rather than one
     sound, which is what makes them read as a process with a duration. */
  reload(durationMs, shell = false) {
    if (!this.ready) return;
    const d = durationMs / 1000;
    if (shell) {
      this.click(1500, 0.05, 0.3, 0);
      this.click(900, 0.06, 0.28, d * 0.55);
      return;
    }
    this.click(1200, 0.05, 0.30, 0.02);            // magazine release
    this.click(700, 0.07, 0.26, d * 0.42);         // magazine out
    this.click(1000, 0.06, 0.34, d * 0.72);        // magazine in
    this.click(2200, 0.045, 0.30, d * 0.93);       // charging handle
  }

  click(freq, dur, gain, delay = 0, bus) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now + delay;
    const n = this._noiseSrc(1.4);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 2.2;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0004, t + dur);
    n.connect(f); f.connect(g); g.connect(bus || this.busFx);
    n.stop(t + dur + 0.02);
  }

  tone(freq, dur, gain, type = 'sine', delay = 0, bus, sweepTo) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0004, t + dur);
    o.connect(g); g.connect(bus || this.busUi);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /* ── Feedback ──────────────────────────────────────────────────── */
  hitmarker(head) { this.tone(head ? 1750 : 1180, head ? 0.09 : 0.06, head ? 0.30 : 0.20, 'square', 0, this.busUi); }
  kill() { this.tone(720, 0.07, 0.22, 'triangle', 0, this.busUi); this.tone(1080, 0.12, 0.20, 'triangle', 0.06, this.busUi); }
  hurt(amount) {
    if (!this.ready) return;
    const c = this.ctx, t = this.now;
    const n = this._noiseSrc(0.7);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(220, t + 0.22);
    const g = c.createGain();
    const level = Math.min(0.5, 0.12 + amount / 130);
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0004, t + 0.26);
    n.connect(f); f.connect(g); g.connect(this.busFx);
    n.stop(t + 0.3);
  }
  death() { this.tone(320, 0.5, 0.24, 'sawtooth', 0, this.busUi, 70); }

  footstep(pan = 0, volume = 1, hard = false) {
    if (!this.ready || !this._voice()) return;
    const c = this.ctx, t = this.now;
    const n = this._noiseSrc(0.8 + Math.random() * 0.5);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = hard ? 900 + Math.random() * 300 : 420 + Math.random() * 180;
    f.Q.value = 1.1;
    const out = this._out(pan, 0.16 * volume, this.busFx);
    const g = c.createGain();
    g.gain.setValueAtTime(1, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + (hard ? 0.09 : 0.055));
    n.connect(f); f.connect(g); g.connect(out);
    n.stop(t + 0.14);
  }

  jump() { this.click(520, 0.06, 0.14); }
  land(strength) { this.footstep(0, 0.7 + strength, true); if (strength > 0.5) this.tone(110, 0.16, 0.14 * strength, 'sine', 0, this.busFx, 55); }
  impact(pan, distance) {
    if (!this._voice()) return;
    this.click(2400 + Math.random() * 1400, 0.045, 0.16 / (1 + distance * 0.08), 0, this.busFx);
  }
  switchWeapon() { this.click(1400, 0.05, 0.22); this.click(900, 0.05, 0.18, 0.08); }

  /* ── UI and match ──────────────────────────────────────────────── */
  uiHover() { this.tone(880, 0.03, 0.05, 'sine'); }
  uiClick() { this.tone(1320, 0.05, 0.12, 'square'); this.tone(660, 0.07, 0.06, 'sine', 0.01); }
  uiBack() { this.tone(520, 0.06, 0.10, 'square'); }
  uiError() { this.tone(220, 0.16, 0.14, 'sawtooth'); }

  countdown(n) {
    if (n > 0) this.tone(560 + (3 - n) * 110, 0.13, 0.22, 'square');
    else { this.tone(880, 0.16, 0.26, 'square'); this.tone(1320, 0.30, 0.22, 'sine', 0.09); }
  }

  matchEnd(won) {
    const notes = won ? [523, 659, 784, 1047] : [392, 330, 262];
    notes.forEach((f, i) => this.tone(f, 0.32, 0.16, 'triangle', i * 0.14, this.busMusic));
  }

  /* A quiet bed of noise so a silent map does not feel like a bug. It is
     one filtered noise source, which costs effectively nothing. */
  ambience(theme) {
    if (!this.ready) return;
    this.stopAmbience();
    const c = this.ctx;
    const n = this._noiseSrc(0.25);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = theme && theme.outdoor ? 480 : 260;
    const g = c.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(theme && theme.outdoor ? 0.045 : 0.03, c.currentTime + 2.5);
    n.connect(f); f.connect(g); g.connect(this.busMusic);
    // A slow swell, so it does not sit perfectly still.
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.06;
    const lg = c.createGain();
    lg.gain.value = 0.012;
    lfo.connect(lg); lg.connect(g.gain);
    lfo.start();
    this._amb = { n, lfo, g };
  }

  stopAmbience() {
    if (!this._amb) return;
    try { this._amb.n.stop(); this._amb.lfo.stop(); } catch {}
    this._amb = null;
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
}

function makeNoise(ctx, seconds) {
  const n = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  /* Slightly pink rather than white: a one-pole filter over white noise.
     Pure white is thin and hissy through a phone speaker. */
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    last = 0.86 * last + 0.14 * w;
    d[i] = (w * 0.7 + last * 1.6) * 0.55;
  }
  return buf;
}

/* Pan and volume for a world-space sound, given the listener's position
   and facing. Returns null when it is too far to bother playing. */
export function spatialise(listener, yaw, x, y, z, maxDist = 90) {
  const dx = x - listener.x, dy = y - listener.y, dz = z - listener.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > maxDist) return null;
  // Project onto the listener's right vector for the pan.
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const d = dist || 1;
  const pan = Math.max(-1, Math.min(1, ((dx / d) * rx + (dz / d) * rz) * 1.15));
  return { pan, distance: dist };
}
