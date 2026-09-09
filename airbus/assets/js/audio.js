/* ═══════════════════════════════════════════════════════════
   audio.js — every sound in this project is synthesised.

   There is not one audio file: switches, detents, the engine
   ambience and the wind are all built from oscillators and
   filtered noise at the moment they play. That keeps the whole
   sound design at roughly two hundred lines and nothing to
   download, and it means the engine note can actually follow N1
   rather than cross-fading between two recordings.

   Nothing starts until the visitor asks for it. The context is
   not even created until the first gesture, and the site opens
   muted.
   ═══════════════════════════════════════════════════════════ */

import { clamp, lerp, bus } from './core.js';

class Audio {
  constructor() {
    this.ctx = null;
    this.muted = true;
    this.ready = false;
    this._noise = null;
    this.beds = {};
  }

  /* Created lazily, on a real gesture, because a context made
     before one is suspended anyway and browsers rightly complain
     about it. */
  init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    /* One shared four-second noise buffer, looped. Generating it
       per-voice would cost 176 KB of float per sound. */
    const len = this.ctx.sampleRate * 4;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;      /* a touch of brown, so it is not hissy */
      d[i] = last * 3.2;
    }
    this._noise = buf;
    this.ready = true;
    return this.ctx;
  }

  setMuted(m) {
    this.muted = m;
    if (!m) this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(m ? 0 : 0.9, t, 0.12);
    bus.emit('audio:mute', m);
  }

  get on() { return !this.muted && this.ctx && this.ready; }

  noiseSource(loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    s.loop = loop;
    return s;
  }

  /* ── one-shots ─────────────────────────────────────────── */

  /* A UI click is a very short band-passed noise burst plus a
     click transient. Two envelopes, no samples. */
  click(pitch = 1, level = 0.22) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    const n = this.noiseSource(false);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800 * pitch;
    bp.Q.value = 2.6;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    n.connect(bp).connect(g).connect(this.master);
    n.start(t); n.stop(t + 0.06);
  }

  /* A toggle has two events — the detent breaking and the stop
     it lands on — about 30 ms apart. That gap is the whole
     difference between a switch and a beep. */
  toggle(up = true) {
    if (!this.on) return;
    this.click(up ? 1.5 : 1.1, 0.16);
    const t = this.ctx.currentTime + 0.032;
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(up ? 320 : 210, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.10, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2400;
    o.connect(lp).connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.07);
  }

  detent() { this.click(2.2, 0.10); }

  /* The single chime an Airbus flight deck makes for a caution. */
  chime(kind = 'ok') {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    const freqs = kind === 'warn' ? [740, 590] : kind === 'ok' ? [880, 1320] : [520];
    freqs.forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      const at = t + i * 0.16;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.16, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
      o.connect(g).connect(this.master);
      o.start(at); o.stop(at + 0.6);
    });
  }

  /* Hydraulics: filtered noise with the cutoff sweeping, which
     is what a gear door or a flap track actually sounds like. */
  servo(duration = 2.2, low = 200, high = 900) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    const n = this.noiseSource(true);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(low, t);
    bp.frequency.linearRampToValueAtTime(high, t + duration * 0.55);
    bp.frequency.linearRampToValueAtTime(low * 1.2, t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.10, t + 0.15);
    g.gain.setValueAtTime(0.10, t + duration - 0.3);
    g.gain.linearRampToValueAtTime(0, t + duration);
    n.connect(bp).connect(g).connect(this.master);
    n.start(t); n.stop(t + duration + 0.05);
  }

  thud(level = 0.4) {
    if (!this.on) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.28);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.45);

    const n = this.noiseSource(false);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 420;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(level * 0.7, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    n.connect(lp).connect(ng).connect(this.master);
    n.start(t); n.stop(t + 0.3);
  }

  /* ── continuous beds ───────────────────────────────────── */

  /* The engine is three layers: a low rumble from the core, a
     band of noise for the jet, and a thin sine for the fan whine
     whose pitch tracks N1. Only the gains and that one frequency
     move, so it costs three nodes and no allocation per frame. */
  engine() {
    if (!this.ctx || this.beds.engine) return this.beds.engine;
    const c = this.ctx;
    const out = c.createGain(); out.gain.value = 0; out.connect(this.master);

    const rumble = this.noiseSource();
    const rlp = c.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 150;
    const rg = c.createGain(); rg.gain.value = 0.9;
    rumble.connect(rlp).connect(rg).connect(out);

    const jet = this.noiseSource();
    const jbp = c.createBiquadFilter(); jbp.type = 'bandpass';
    jbp.frequency.value = 900; jbp.Q.value = 0.7;
    const jg = c.createGain(); jg.gain.value = 0.25;
    jet.connect(jbp).connect(jg).connect(out);

    const whine = c.createOscillator(); whine.type = 'sawtooth'; whine.frequency.value = 240;
    const wlp = c.createBiquadFilter(); wlp.type = 'lowpass'; wlp.frequency.value = 2600;
    const wg = c.createGain(); wg.gain.value = 0.012;
    whine.connect(wlp).connect(wg).connect(out);

    rumble.start(); jet.start(); whine.start();
    return (this.beds.engine = {
      out, whine, jbp, jg, wg,
      set(n1, level) {
        const t = c.currentTime;
        out.gain.setTargetAtTime(clamp(level, 0, 1) * 0.30, t, 0.25);
        whine.frequency.setTargetAtTime(lerp(150, 1180, n1), t, 0.4);
        jbp.frequency.setTargetAtTime(lerp(450, 2200, n1), t, 0.4);
        wg.gain.setTargetAtTime(lerp(0.004, 0.040, n1), t, 0.4);
      }
    });
  }

  /* Slipstream: high-passed noise whose corner and level rise
     with airspeed. */
  wind() {
    if (!this.ctx || this.beds.wind) return this.beds.wind;
    const c = this.ctx;
    const out = c.createGain(); out.gain.value = 0; out.connect(this.master);
    const n = this.noiseSource();
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
    n.connect(hp).connect(lp).connect(out);
    n.start();
    return (this.beds.wind = {
      out,
      set(speed, level) {
        const t = c.currentTime;
        out.gain.setTargetAtTime(clamp(level, 0, 1) * 0.16, t, 0.3);
        hp.frequency.setTargetAtTime(lerp(300, 1500, clamp(speed / 350, 0, 1)), t, 0.5);
      }
    });
  }

  /* Room tone for the hangar: a very low filtered bed with a
     touch of movement, which is what makes a big empty space
     read as big rather than as silence. */
  room() {
    if (!this.ctx || this.beds.room) return this.beds.room;
    const c = this.ctx;
    const out = c.createGain(); out.gain.value = 0; out.connect(this.master);
    const n = this.noiseSource();
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = c.createGain(); lfoG.gain.value = 60;
    lfo.connect(lfoG).connect(lp.frequency);
    n.connect(lp).connect(out);
    n.start(); lfo.start();
    return (this.beds.room = {
      out,
      set(level) { out.gain.setTargetAtTime(clamp(level, 0, 1) * 0.13, c.currentTime, 0.6); }
    });
  }

  silenceBeds() {
    for (const k in this.beds) {
      const b = this.beds[k];
      if (b?.out) b.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    }
  }
}

export const audio = new Audio();
