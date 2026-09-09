/* ═══════════════════════════════════════════════════════════
   displays.js — the six screens, drawn every frame.

   Each display is a 2-D canvas uploaded as a texture on the
   corresponding panel in the flight deck. They are drawn from
   the same FlightModel the aircraft is flown by, so the speed
   tape moves because the aircraft accelerated, not because a
   number was animated at it.

   Colour follows the convention the real displays use, and it
   carries meaning: green is what the aircraft is doing, magenta
   is what it has been asked to do, cyan is a limit or a
   constraint, amber is a caution and red is a warning. Nothing
   here is coloured for decoration.

   Everything is redrawn at 20 Hz rather than every frame — the
   instruments update faster than the eye resolves either way,
   and the saving pays for the aircraft outside the window.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.min.js';
import { clamp, lerp, pad, deg, rad2deg } from './core.js';
import { DETENTS } from './sim.js';

const GREEN = '#2fe07a';
const MAGENTA = '#ff5cf0';
const CYAN = '#22d3ee';
const AMBER = '#ffb020';
const RED = '#ff4444';
const WHITE = '#f2f6fb';
const GREY = '#8b97a6';
const SKY = '#1e7fd4';
const GROUND = '#8a5a1f';

function screen(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return { c, x, t };
}

const mono = (size, weight = 600) => `${weight} ${size}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;

function text(x, s, str, px, py, { size = 18, color = WHITE, align = 'left', weight = 600, baseline = 'middle' } = {}) {
  x.font = mono(size, weight);
  x.fillStyle = color;
  x.textAlign = align;
  x.textBaseline = baseline;
  x.fillText(str, px, py);
  void s;
}

function boxed(x, px, py, w, h, color) {
  x.strokeStyle = color; x.lineWidth = 2;
  x.strokeRect(px - w / 2, py - h / 2, w, h);
}

/* ── PFD ─────────────────────────────────────────────────── */

export class PFD {
  constructor(size = 512) {
    Object.assign(this, screen(size, size));
    this.S = size;
  }

  draw(fm) {
    const { x, S } = this;
    const cx = S * 0.52, cy = S * 0.44;
    const R = S * 0.30;

    x.fillStyle = '#05070c';
    x.fillRect(0, 0, S, S);

    /* ── attitude ─────────────────────────────────────── */
    x.save();
    x.beginPath();
    x.rect(cx - R * 1.06, cy - R * 1.02, R * 2.12, R * 2.04);
    x.clip();

    const pitchPx = R / (18 * deg);
    x.translate(cx, cy);
    x.rotate(-fm.phi);
    x.translate(0, fm.theta * pitchPx);

    x.fillStyle = SKY;
    x.fillRect(-S, -S * 2, S * 2, S * 2);
    x.fillStyle = GROUND;
    x.fillRect(-S, 0, S * 2, S * 2);
    x.fillStyle = WHITE;
    x.fillRect(-S, -1.5, S * 2, 3);

    /* pitch ladder: 10° lines long, 5° short, numbered */
    x.strokeStyle = WHITE; x.lineWidth = 2;
    for (let p = -30; p <= 30; p += 5) {
      if (p === 0) continue;
      const y = -p * deg * pitchPx;
      const w = p % 10 === 0 ? R * 0.36 : R * 0.18;
      x.beginPath();
      x.moveTo(-w, y); x.lineTo(w, y);
      x.stroke();
      if (p % 10 === 0) {
        text(x, this, String(Math.abs(p)), -w - 8, y, { size: S * 0.030, align: 'right' });
        text(x, this, String(Math.abs(p)), w + 8, y, { size: S * 0.030, align: 'left' });
      }
    }
    x.restore();

    /* bank scale */
    x.save();
    x.translate(cx, cy);
    x.strokeStyle = WHITE; x.lineWidth = 2;
    for (const a of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
      const r = a * deg;
      const len = Math.abs(a) % 30 === 0 ? R * 0.10 : R * 0.055;
      x.beginPath();
      x.moveTo(Math.sin(r) * R, -Math.cos(r) * R);
      x.lineTo(Math.sin(r) * (R + len), -Math.cos(r) * (R + len));
      x.stroke();
    }
    /* the bank pointer, which is what actually tells you the roll */
    x.rotate(-fm.phi);
    x.fillStyle = Math.abs(fm.phi) > 33 * deg ? AMBER : WHITE;
    x.beginPath();
    x.moveTo(0, -R);
    x.lineTo(-R * 0.055, -R * 0.90);
    x.lineTo(R * 0.055, -R * 0.90);
    x.closePath(); x.fill();
    x.restore();

    /* fixed aircraft symbol */
    x.strokeStyle = '#ffe14d'; x.lineWidth = 4;
    x.beginPath();
    x.moveTo(cx - R * 0.46, cy); x.lineTo(cx - R * 0.16, cy);
    x.moveTo(cx + R * 0.16, cy); x.lineTo(cx + R * 0.46, cy);
    x.moveTo(cx, cy - R * 0.05); x.lineTo(cx, cy + R * 0.05);
    x.stroke();

    /* flight director, when the autopilot is doing the flying */
    if (fm.ap.on) {
      x.strokeStyle = MAGENTA; x.lineWidth = 3;
      const fdX = cx + clamp(fm.phi * -260, -R * 0.7, R * 0.7);
      const fdY = cy + clamp((fm.theta - fm.gamma) * -420, -R * 0.7, R * 0.7);
      x.beginPath();
      x.moveTo(fdX, cy - R * 0.42); x.lineTo(fdX, cy + R * 0.42);
      x.moveTo(cx - R * 0.42, fdY); x.lineTo(cx + R * 0.42, fdY);
      x.stroke();
    }

    /* ── speed tape ───────────────────────────────────── */
    const tapeW = S * 0.135, tapeX = S * 0.085;
    x.fillStyle = 'rgba(8,12,18,0.82)';
    x.fillRect(tapeX - tapeW / 2, cy - R, tapeW, R * 2);

    const ias = fm.ias;
    const pxPerKt = (R * 2) / 120;
    x.save();
    x.beginPath(); x.rect(tapeX - tapeW / 2, cy - R, tapeW, R * 2); x.clip();
    x.strokeStyle = WHITE; x.lineWidth = 2;
    for (let v = Math.floor((ias - 70) / 10) * 10; v <= ias + 70; v += 10) {
      if (v < 30) continue;
      const y = cy + (ias - v) * pxPerKt;
      x.beginPath();
      x.moveTo(tapeX + tapeW / 2 - 10, y); x.lineTo(tapeX + tapeW / 2, y);
      x.stroke();
      if (v % 20 === 0) text(x, this, String(v), tapeX + tapeW / 2 - 14, y, { size: S * 0.036, align: 'right' });
    }
    /* V-speeds and the low-speed band */
    const vls = fm.vRefKt * 0.94;
    x.fillStyle = AMBER;
    x.fillRect(tapeX + tapeW / 2 - 7, cy + (ias - vls) * pxPerKt, 6, R * 2);
    x.strokeStyle = MAGENTA; x.lineWidth = 3;
    const ty = cy + (ias - fm.ap.spd) * pxPerKt;
    x.beginPath();
    x.moveTo(tapeX - tapeW / 2, ty); x.lineTo(tapeX - tapeW / 2 + 12, ty);
    x.stroke();
    if (fm.onGround && fm.phase <= 4) {
      for (const [v, lbl] of [[fm.v1Kt, '1'], [fm.vrKt, 'R'], [fm.v2Kt, '2']]) {
        const yy = cy + (ias - v) * pxPerKt;
        text(x, this, lbl, tapeX + tapeW / 2 + 4, yy, { size: S * 0.030, color: CYAN });
      }
    }
    x.restore();

    boxed(x, tapeX, cy, tapeW + 8, S * 0.062, WHITE);
    x.fillStyle = '#05070c';
    x.fillRect(tapeX - (tapeW + 8) / 2 + 1, cy - S * 0.031 + 1, tapeW + 6, S * 0.062 - 2);
    text(x, this, String(Math.round(ias)).padStart(3, ' '), tapeX + tapeW * 0.44, cy,
      { size: S * 0.052, color: GREEN, align: 'right', weight: 700 });
    text(x, this, 'SPD', tapeX, cy - R - S * 0.028, { size: S * 0.026, color: GREY, align: 'center' });
    text(x, this, `M ${fm.mach.toFixed(3).slice(1)}`, tapeX, cy + R + S * 0.030,
      { size: S * 0.030, color: GREEN, align: 'center' });

    /* ── altitude tape ────────────────────────────────── */
    const altX = S * 0.885;
    x.fillStyle = 'rgba(8,12,18,0.82)';
    x.fillRect(altX - tapeW / 2, cy - R, tapeW, R * 2);
    const altFt = fm.altFt;
    const pxPerFt = (R * 2) / 1200;
    x.save();
    x.beginPath(); x.rect(altX - tapeW / 2, cy - R, tapeW, R * 2); x.clip();
    x.strokeStyle = WHITE; x.lineWidth = 2;
    for (let a = Math.floor((altFt - 700) / 100) * 100; a <= altFt + 700; a += 100) {
      const y = cy + (altFt - a) * pxPerFt;
      x.beginPath();
      x.moveTo(altX - tapeW / 2, y); x.lineTo(altX - tapeW / 2 + 10, y);
      x.stroke();
      if (a % 500 === 0) text(x, this, String(a), altX - tapeW / 2 + 14, y, { size: S * 0.034 });
    }
    x.strokeStyle = MAGENTA; x.lineWidth = 3;
    const ay = cy + (altFt - fm.ap.alt) * pxPerFt;
    x.beginPath(); x.moveTo(altX + tapeW / 2, ay); x.lineTo(altX + tapeW / 2 - 12, ay); x.stroke();
    /* ground, drawn as the hatched band it is */
    const gy = cy + (altFt - fm.groundAlt / 0.3048) * pxPerFt;
    x.fillStyle = 'rgba(255,176,32,0.28)';
    x.fillRect(altX - tapeW / 2, gy, tapeW, R * 2);
    x.restore();

    boxed(x, altX, cy, tapeW + 8, S * 0.062, WHITE);
    x.fillStyle = '#05070c';
    x.fillRect(altX - (tapeW + 8) / 2 + 1, cy - S * 0.031 + 1, tapeW + 6, S * 0.062 - 2);
    text(x, this, String(Math.round(altFt)).padStart(5, ' '), altX + tapeW * 0.46, cy,
      { size: S * 0.046, color: GREEN, align: 'right', weight: 700 });
    text(x, this, 'ALT', altX, cy - R - S * 0.028, { size: S * 0.026, color: GREY, align: 'center' });

    /* vertical speed, on its own scale to the right */
    const vsX = S * 0.975;
    const vs = clamp(fm.vsFpm, -6000, 6000);
    const vsY = cy - Math.sign(vs) * Math.pow(Math.abs(vs) / 6000, 0.55) * R * 0.86;
    x.strokeStyle = GREY; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(vsX, cy - R * 0.9); x.lineTo(vsX, cy + R * 0.9); x.stroke();
    x.strokeStyle = Math.abs(vs) > 2000 ? AMBER : GREEN; x.lineWidth = 3;
    x.beginPath(); x.moveTo(vsX, cy); x.lineTo(vsX - S * 0.028, vsY); x.stroke();
    if (Math.abs(vs) > 100) {
      text(x, this, String(Math.round(Math.abs(vs) / 100) * 100), vsX - S * 0.03, vsY - S * 0.024,
        { size: S * 0.026, color: GREEN, align: 'right' });
    }

    /* ── heading tape ─────────────────────────────────── */
    const hy = S * 0.845;
    x.fillStyle = 'rgba(8,12,18,0.82)';
    x.fillRect(cx - R * 1.06, hy - S * 0.032, R * 2.12, S * 0.064);
    x.save();
    x.beginPath(); x.rect(cx - R * 1.06, hy - S * 0.032, R * 2.12, S * 0.064); x.clip();
    const hdg = fm.hdgDeg;
    const pxPerDeg = (R * 2) / 60;
    x.strokeStyle = WHITE; x.lineWidth = 2;
    for (let h = Math.floor((hdg - 40) / 5) * 5; h <= hdg + 40; h += 5) {
      const px = cx + (h - hdg) * pxPerDeg;
      const big = ((h % 360) + 360) % 10 === 0;
      x.beginPath();
      x.moveTo(px, hy + S * 0.032); x.lineTo(px, hy + S * 0.032 - (big ? 12 : 7));
      x.stroke();
      if (big) {
        text(x, this, pad(((h % 360) + 360) % 360 / 10, 2), px, hy - S * 0.004, { size: S * 0.030, align: 'center' });
      }
    }
    x.strokeStyle = MAGENTA; x.lineWidth = 3;
    let herr = ((fm.ap.hdg - hdg + 540) % 360) - 180;
    const bx = cx + herr * pxPerDeg;
    x.beginPath();
    x.moveTo(bx, hy - S * 0.032); x.lineTo(bx - 7, hy - S * 0.032 - 10);
    x.lineTo(bx + 7, hy - S * 0.032 - 10); x.closePath();
    x.fillStyle = MAGENTA; x.fill();
    x.restore();
    x.fillStyle = '#ffe14d';
    x.beginPath();
    x.moveTo(cx, hy - S * 0.036); x.lineTo(cx - 8, hy - S * 0.056); x.lineTo(cx + 8, hy - S * 0.056);
    x.closePath(); x.fill();

    /* ── FMA ──────────────────────────────────────────── */
    x.fillStyle = 'rgba(8,12,18,0.9)';
    x.fillRect(cx - R * 1.06, S * 0.028, R * 2.12, S * 0.072);
    x.strokeStyle = 'rgba(139,151,166,0.4)'; x.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const px = cx - R * 1.06 + (R * 2.12 * i) / 5;
      x.beginPath(); x.moveTo(px, S * 0.028); x.lineTo(px, S * 0.10); x.stroke();
    }
    const cols = [
      fm.ap.athr ? (fm.throttle > 0.9 ? 'TOGA' : 'SPEED') : 'MAN THR',
      fm.ap.on ? fm.ap.mode : 'MAN PITCH',
      fm.ap.on ? 'HDG' : '',
      fm.ap.on ? 'AP1' : '',
      fm.ap.athr ? 'A/THR' : ''
    ];
    cols.forEach((c, i) => {
      if (!c) return;
      const px = cx - R * 1.06 + (R * 2.12 * (i + 0.5)) / 5;
      text(x, this, c, px, S * 0.064, { size: S * 0.028, color: i > 2 ? WHITE : GREEN, align: 'center' });
    });

    /* radio altitude, called out below 2 500 ft as it is on the
       real display */
    if (fm.radioAlt < 2500 && fm.radioAlt > -20) {
      text(x, this, String(Math.round(fm.radioAlt)), cx, cy + R * 0.72,
        { size: S * 0.052, color: fm.radioAlt < 400 ? AMBER : GREEN, align: 'center', weight: 700 });
    }

    this.t.needsUpdate = true;
  }
}

/* ── ND ──────────────────────────────────────────────────── */

export class ND {
  constructor(size = 512) {
    Object.assign(this, screen(size, size));
    this.S = size;
    this.range = 40;
    this.trail = [];
  }

  draw(fm, plan) {
    const { x, S } = this;
    const cx = S / 2, cy = S * 0.78;
    const R = S * 0.62;

    x.fillStyle = '#05070c';
    x.fillRect(0, 0, S, S);

    const hdg = fm.hdgDeg;

    /* range rings */
    x.strokeStyle = 'rgba(139,151,166,0.5)';
    x.lineWidth = 1.5;
    for (const f of [0.25, 0.5, 0.75]) {
      x.beginPath();
      x.arc(cx, cy, R * f, Math.PI * 1.18, Math.PI * 1.82);
      x.stroke();
      text(x, this, String(Math.round(this.range * f)), cx + R * f * 0.72, cy - R * f * 0.72,
        { size: S * 0.026, color: GREY, align: 'center' });
    }

    /* compass arc */
    x.save();
    x.translate(cx, cy);
    x.strokeStyle = WHITE; x.lineWidth = 2;
    x.beginPath(); x.arc(0, 0, R, Math.PI * 1.14, Math.PI * 1.86); x.stroke();
    for (let a = 0; a < 360; a += 5) {
      const rel = ((a - hdg + 540) % 360) - 180;
      if (Math.abs(rel) > 67) continue;
      const r = rel * deg;
      const big = a % 10 === 0;
      const len = big ? S * 0.030 : S * 0.016;
      x.beginPath();
      x.moveTo(Math.sin(r) * R, -Math.cos(r) * R);
      x.lineTo(Math.sin(r) * (R - len), -Math.cos(r) * (R - len));
      x.stroke();
      if (a % 30 === 0) {
        x.save();
        x.translate(Math.sin(r) * (R - S * 0.062), -Math.cos(r) * (R - S * 0.062));
        x.rotate(r);
        text(x, this, a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : pad(a / 10, 2),
          0, 0, { size: S * 0.034, align: 'center' });
        x.restore();
      }
    }
    x.restore();

    /* the aircraft, and the track it has flown */
    const nmPx = R / this.range;
    const rot = -hdg * deg;
    const project = (wx, wz) => {
      const dx = (wx - fm.x) / 1852, dz = (wz - fm.z) / 1852;
      const ex = dx, ny = -dz;
      return [cx + (ex * Math.cos(rot) - ny * Math.sin(rot)) * nmPx,
              cy - (ex * Math.sin(rot) + ny * Math.cos(rot)) * nmPx];
    };

    if (this.trail.length > 1) {
      x.strokeStyle = 'rgba(47,224,122,0.55)'; x.lineWidth = 2;
      x.beginPath();
      this.trail.forEach(([tx, tz], i) => {
        const [px, py] = project(tx, tz);
        i ? x.lineTo(px, py) : x.moveTo(px, py);
      });
      x.stroke();
    }

    /* the flight plan, drawn in the managed magenta */
    if (plan?.legs?.length) {
      x.strokeStyle = MAGENTA; x.lineWidth = 2.5;
      x.beginPath();
      plan.legs.forEach((w, i) => {
        const [px, py] = project(w.x, w.z);
        i ? x.lineTo(px, py) : x.moveTo(px, py);
      });
      x.stroke();
      for (const w of plan.legs) {
        const [px, py] = project(w.x, w.z);
        x.strokeStyle = MAGENTA; x.lineWidth = 2;
        x.beginPath();
        x.moveTo(px, py - 7); x.lineTo(px + 7, py); x.lineTo(px, py + 7); x.lineTo(px - 7, py);
        x.closePath(); x.stroke();
        text(x, this, w.name, px + 10, py - 8, { size: S * 0.026, color: MAGENTA });
      }
    }

    /* the runway, always, because it is where you came from */
    {
      const [ax, ay] = project(0, 0);
      const [bx, by] = project(3500, 0);
      x.strokeStyle = CYAN; x.lineWidth = 3;
      x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
      text(x, this, 'RW09', bx + 8, by, { size: S * 0.026, color: CYAN });
    }

    /* aircraft symbol */
    x.fillStyle = '#ffe14d';
    x.beginPath();
    x.moveTo(cx, cy - S * 0.028);
    x.lineTo(cx - S * 0.020, cy + S * 0.020);
    x.lineTo(cx, cy + S * 0.010);
    x.lineTo(cx + S * 0.020, cy + S * 0.020);
    x.closePath(); x.fill();

    /* readouts */
    text(x, this, 'GS', S * 0.035, S * 0.045, { size: S * 0.028, color: WHITE });
    text(x, this, String(Math.round(fm.tas)), S * 0.085, S * 0.045, { size: S * 0.040, color: GREEN });
    text(x, this, 'TAS', S * 0.175, S * 0.045, { size: S * 0.028, color: WHITE });
    text(x, this, String(Math.round(fm.tas)), S * 0.245, S * 0.045, { size: S * 0.040, color: GREEN });
    text(x, this, `${this.range} NM`, S * 0.965, S * 0.045, { size: S * 0.030, color: WHITE, align: 'right' });
    text(x, this, 'ARC', S * 0.965, S * 0.085, { size: S * 0.026, color: CYAN, align: 'right' });

    const rw = fm.toRunway();
    text(x, this, `RWY ${rw.dist.toFixed(1)} NM`, S * 0.035, S * 0.965, { size: S * 0.028, color: CYAN });

    /* heading box at the top of the arc */
    boxed(x, cx, S * 0.052, S * 0.13, S * 0.058, WHITE);
    text(x, this, pad(hdg, 3), cx, S * 0.052, { size: S * 0.040, color: GREEN, align: 'center', weight: 700 });

    this.t.needsUpdate = true;
  }

  push(fm) {
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(fm.x - last[0], fm.z - last[1]) > 400) {
      this.trail.push([fm.x, fm.z]);
      if (this.trail.length > 90) this.trail.shift();
    }
  }
}

/* ── ECAM upper: engine and warning display ──────────────── */

export class EWD {
  constructor(size = 512) {
    Object.assign(this, screen(size, Math.round(size * 0.8)));
    this.S = size;
  }

  draw(fm) {
    const { x, S } = this;
    const H = this.c.height;
    x.fillStyle = '#05070c';
    x.fillRect(0, 0, S, H);

    const n = fm.type.geo.engines;
    const gaugeR = S * 0.088;
    const spread = S * 0.86 / n;

    for (let i = 0; i < n; i++) {
      const gx = S * 0.07 + spread * (i + 0.5);
      /* N1 dial */
      const gy = H * 0.24;
      x.strokeStyle = 'rgba(139,151,166,0.55)'; x.lineWidth = 3;
      x.beginPath(); x.arc(gx, gy, gaugeR, Math.PI * 0.75, Math.PI * 2.15); x.stroke();
      x.strokeStyle = RED; x.lineWidth = 3;
      x.beginPath(); x.arc(gx, gy, gaugeR, Math.PI * 2.02, Math.PI * 2.15); x.stroke();

      const val = fm.n1 * (1 - (i % 2) * 0.004);
      const a = Math.PI * 0.75 + val * Math.PI * 1.4;
      x.strokeStyle = GREEN; x.lineWidth = 4;
      x.beginPath();
      x.moveTo(gx, gy);
      x.lineTo(gx + Math.cos(a) * gaugeR * 0.92, gy + Math.sin(a) * gaugeR * 0.92);
      x.stroke();
      text(x, this, (val * 100).toFixed(1), gx, gy + gaugeR * 0.55,
        { size: S * 0.044, color: GREEN, align: 'center', weight: 700 });
      text(x, this, 'N1', gx, gy - gaugeR * 1.28, { size: S * 0.026, color: WHITE, align: 'center' });

      /* EGT, which tracks N1 with a lag and a floor */
      const egt = 320 + val * 480 + (fm.throttle > 0.9 ? 60 : 0);
      const ey = H * 0.53;
      x.strokeStyle = 'rgba(139,151,166,0.55)'; x.lineWidth = 3;
      x.beginPath(); x.arc(gx, ey, gaugeR * 0.78, Math.PI * 0.75, Math.PI * 2.15); x.stroke();
      const ea = Math.PI * 0.75 + clamp(egt / 950, 0, 1) * Math.PI * 1.4;
      x.strokeStyle = egt > 860 ? AMBER : GREEN; x.lineWidth = 4;
      x.beginPath();
      x.moveTo(gx, ey);
      x.lineTo(gx + Math.cos(ea) * gaugeR * 0.72, ey + Math.sin(ea) * gaugeR * 0.72);
      x.stroke();
      text(x, this, String(Math.round(egt)), gx, ey + gaugeR * 0.45,
        { size: S * 0.038, color: egt > 860 ? AMBER : GREEN, align: 'center' });
      text(x, this, 'EGT', gx, ey - gaugeR * 1.05, { size: S * 0.024, color: WHITE, align: 'center' });

      /* N2 and fuel flow as plain numbers, as they are */
      text(x, this, `${(val * 96 + 18).toFixed(1)}`, gx, H * 0.70, { size: S * 0.032, color: GREEN, align: 'center' });
      text(x, this, `${Math.round(val * 2600 + 220)}`, gx, H * 0.77, { size: S * 0.032, color: GREEN, align: 'center' });
    }
    text(x, this, 'N2', S * 0.045, H * 0.70, { size: S * 0.026, color: WHITE });
    text(x, this, 'FF', S * 0.045, H * 0.77, { size: S * 0.026, color: WHITE });
    text(x, this, 'KG/H', S * 0.955, H * 0.77, { size: S * 0.022, color: GREY, align: 'right' });

    /* flap and slat position, the way the real E/WD shows it */
    const fx = S * 0.50, fy = H * 0.885;
    text(x, this, `S ${(fm.slat * 100).toFixed(0)}`, fx - S * 0.13, fy, { size: S * 0.030, color: GREEN, align: 'right' });
    text(x, this, DETENTS[fm.detent].name, fx, fy, { size: S * 0.038, color: GREEN, align: 'center', weight: 700 });
    text(x, this, `F ${(fm.flap * 100).toFixed(0)}`, fx + S * 0.13, fy, { size: S * 0.030, color: GREEN });

    /* memo and warnings */
    const memo = [];
    if (fm.parkBrake) memo.push(['PARK BRK', AMBER]);
    if (fm.gear > 0.5 && fm.ias > 200) memo.push(['GEAR — SPEED', AMBER]);
    if (fm.systems.seatbelts) memo.push(['SEAT BELTS', GREEN]);
    if (fm.systems.landingLights) memo.push(['LDG LT', GREEN]);
    if (fm.spoilerTarget > 0.5) memo.push(['SPD BRK', AMBER]);
    if (!fm.running && fm.systems.apu) memo.push(['APU AVAIL', GREEN]);
    if (fm.radioAlt < 500 && !fm.onGround && fm.gear < 0.5) memo.push(['L/G NOT DOWN', RED]);
    if (fm.ias > 0 && fm.ias < fm.vRefKt * 0.92 && !fm.onGround) memo.push(['SPEED SPEED', RED]);

    memo.slice(0, 5).forEach(([m, c], i) => {
      text(x, this, m, S * 0.045, H * 0.955 - i * S * 0.038, { size: S * 0.028, color: c });
    });
    fm.events.slice(0, 3).forEach((e, i) => {
      text(x, this, e.msg, S * 0.955, H * 0.955 - i * S * 0.038,
        { size: S * 0.026, color: GREY, align: 'right' });
    });

    this.t.needsUpdate = true;
  }
}

/* ── ECAM lower: system synoptic ─────────────────────────── */

export class SD {
  constructor(size = 512) {
    Object.assign(this, screen(size, Math.round(size * 0.8)));
    this.S = size;
    this.page = 'WHEEL';
  }

  draw(fm) {
    const { x, S } = this;
    const H = this.c.height;
    x.fillStyle = '#05070c';
    x.fillRect(0, 0, S, H);

    const page = fm.onGround ? 'WHEEL' : fm.radioAlt < 2000 ? 'WHEEL' : 'CRUISE';
    text(x, this, page, S / 2, H * 0.075, { size: S * 0.040, color: WHITE, align: 'center' });

    if (page === 'WHEEL') {
      /* gear and brake synoptic: three legs, temperatures, and
         whether the doors are where they should be */
      const legs = [['NOSE', S * 0.5, H * 0.28], ['LEFT', S * 0.24, H * 0.56], ['RIGHT', S * 0.76, H * 0.56]];
      for (const [name, lx, ly] of legs) {
        const down = fm.gear > 0.95;
        const moving = fm.gear > 0.02 && fm.gear < 0.95;
        x.strokeStyle = moving ? AMBER : down ? GREEN : GREY;
        x.lineWidth = 4;
        x.beginPath();
        x.moveTo(lx, ly - S * 0.05);
        x.lineTo(lx, ly + S * 0.03 * fm.gear);
        x.stroke();
        x.fillStyle = moving ? AMBER : down ? GREEN : 'rgba(139,151,166,0.35)';
        for (const off of [-1, 1]) {
          x.beginPath();
          x.arc(lx + off * S * 0.030, ly + S * 0.03 * fm.gear, S * 0.020, 0, Math.PI * 2);
          x.fill();
        }
        text(x, this, name, lx, ly - S * 0.075, { size: S * 0.026, color: WHITE, align: 'center' });
        if (name !== 'NOSE') {
          const temp = Math.round(60 + fm.brakes * 260 + Math.min(fm.V, 90) * 1.4);
          text(x, this, `${temp}°`, lx, ly + S * 0.085,
            { size: S * 0.028, color: temp > 300 ? AMBER : GREEN, align: 'center' });
        }
      }
      text(x, this, fm.parkBrake ? 'PARK BRK ON' : 'BRK REL',
        S / 2, H * 0.90, { size: S * 0.030, color: fm.parkBrake ? AMBER : GREEN, align: 'center' });
      text(x, this, `AUTO BRK ${['OFF', 'LO', 'MED', 'MAX'][fm.autobrake]}`,
        S / 2, H * 0.965, { size: S * 0.028, color: fm.autobrake ? GREEN : GREY, align: 'center' });
    } else {
      const rows = [
        ['CABIN ALT', `${Math.round(Math.min(fm.altFt * 0.16, 6800))} FT`, GREEN],
        ['CABIN V/S', `${Math.round(fm.vsFpm * 0.14)} FT/MIN`, GREEN],
        ['CABIN ΔP', `${(Math.min(fm.altFt / 5200, 8.2)).toFixed(1)} PSI`, GREEN],
        ['TAT', `${Math.round(fm.atm.T - 273.15 + fm.mach * fm.mach * 32)}°C`, GREEN],
        ['SAT', `${Math.round(fm.atm.T - 273.15)}°C`, GREEN],
        ['ISA', `${Math.round(fm.atm.T - (288.15 - 0.0065 * fm.alt))}°C`, GREEN],
        ['G.W.', `${Math.round(fm.mass / 1000)} T`, GREEN]
      ];
      rows.forEach(([k, v, c], i) => {
        const y = H * 0.22 + i * H * 0.10;
        text(x, this, k, S * 0.10, y, { size: S * 0.030, color: WHITE });
        text(x, this, v, S * 0.90, y, { size: S * 0.032, color: c, align: 'right' });
      });
    }
    this.t.needsUpdate = true;
  }
}

export { GREEN, MAGENTA, CYAN, AMBER, RED, WHITE, GREY, mono, screen, text };
