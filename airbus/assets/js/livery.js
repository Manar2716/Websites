/* ═══════════════════════════════════════════════════════════
   livery.js — paint, drawn at runtime.

   Four canvases per aircraft: the hull, the wing upper surface,
   the fin, and a nacelle. Nothing is downloaded and nothing is
   photographed, which means every marking stays sharp on a 4K
   panel and the whole fleet costs no network at all.

   The scheme is the manufacturer's own house style — white hull,
   deep blue empennage, blue titles — and deliberately carries no
   airline's trade dress. Registrations are drawn from the F-W…
   block Airbus actually uses for its own development aircraft,
   with invented serials.

   Texture space for the hull is (u = nose→tail, v = around the
   section, 0 at the crown). So v = 0.25 is the right-hand side
   at the widest point, which is where the windows go, and v =
   0.5 is the keel.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.min.js';
import { quality, clamp, lerp } from './core.js';

const BLUE = '#00205b';
const BLUE_MID = '#0b3f8f';
const BLUE_LIGHT = '#1f7ae0';
const PAINT_WHITE = '#f7f9fb';
const PAINT_GREY = '#c7ced6';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, x: c.getContext('2d') };
}

function toTexture(c, { srgb = true, repeatY = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = quality.anisotropy;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = repeatY ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

/* Faint lap joints and frame lines. Real aluminium is a quilt of
   panels, and a fuselage without them reads as plastic — but a
   fuselage *with* strong ones reads as a diagram, so these sit
   barely above the paint. */
function panelLines(x, w, h, stepX, stepY, alpha) {
  x.save();
  x.strokeStyle = `rgba(120,132,146,${alpha})`;
  x.lineWidth = 1;
  x.beginPath();
  for (let px = stepX; px < w; px += stepX) { x.moveTo(px, 0); x.lineTo(px, h); }
  for (let py = stepY; py < h; py += stepY) { x.moveTo(0, py); x.lineTo(w, py); }
  x.stroke();
  x.restore();
}

/* Unwrapping a tube into a rectangle turns one flank into a
   mirror of the other, and three.js flips the canvas vertically
   on upload — so a marking drawn straight onto this texture
   comes out reversed on the right-hand side of the aircraft and
   correct on the left. Every piece of text goes through here,
   which applies the half-turn the right flank needs.

   With flipY, canvas rows above the midline land on the aircraft's
   left side and rows below it on the right. */
function label(x, u, v, draw) {
  x.save();
  x.translate(u, v);
  if (v > x.canvas.height * 0.5) x.scale(-1, -1);
  x.textBaseline = 'middle';
  draw(x);
  x.restore();
}

function roundRect(x, px, py, w, h, r) {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}

/* ── hull ────────────────────────────────────────────────── */

function hullCanvas(type, emissive) {
  const { geo, spec } = type;
  const W = quality.tier === 2 ? 4096 : 2048;
  const H = W / 4;
  const { c, x } = makeCanvas(W, H);
  const U = (f) => f * W;                       /* fraction of length → px */
  const V = (a) => a * H;                       /* fraction of section → px */

  if (emissive) { x.fillStyle = '#000'; x.fillRect(0, 0, W, H); }
  else {
    /* base coat, with the crown slightly brighter than the keel
       so the paint still reads as curved under flat light */
    const grad = x.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0.00, '#ffffff');
    grad.addColorStop(0.25, PAINT_WHITE);
    grad.addColorStop(0.50, '#dfe5ec');
    grad.addColorStop(0.75, PAINT_WHITE);
    grad.addColorStop(1.00, '#ffffff');
    x.fillStyle = grad;
    x.fillRect(0, 0, W, H);

    panelLines(x, W, H, W * 0.0135, H * 0.055, 0.10);

    /* radome — a different material, so a different grey */
    x.fillStyle = '#9aa3ad';
    x.fillRect(0, 0, U(geo.noseLen * 0.42), H);
    const nose = x.createLinearGradient(U(geo.noseLen * 0.34), 0, U(geo.noseLen * 0.62), 0);
    nose.addColorStop(0, '#9aa3ad'); nose.addColorStop(1, 'rgba(247,249,251,0)');
    x.fillStyle = nose;
    x.fillRect(U(geo.noseLen * 0.34), 0, U(geo.noseLen * 0.30), H);

    /* anti-glare panel ahead of the windscreen */
    x.fillStyle = '#16181c';
    x.fillRect(U(geo.noseLen * 0.42), V(0.955), U(geo.noseLen * 0.55), V(0.09));
    x.fillRect(U(geo.noseLen * 0.42), 0, U(geo.noseLen * 0.55), V(0.045));

    /* belly — grey, because that is where the runway grit goes */
    const belly = x.createLinearGradient(0, V(0.40), 0, V(0.50));
    belly.addColorStop(0, 'rgba(199,206,214,0)'); belly.addColorStop(1, PAINT_GREY);
    x.fillStyle = belly; x.fillRect(0, V(0.40), W, V(0.10));
    const belly2 = x.createLinearGradient(0, V(0.60), 0, V(0.50));
    belly2.addColorStop(0, 'rgba(199,206,214,0)'); belly2.addColorStop(1, PAINT_GREY);
    x.fillStyle = belly2; x.fillRect(0, V(0.50), W, V(0.10));

    /* the sweep: a blue wave that lifts off the belly and runs
       into the tail, drawn twice because the hull is unwrapped
       into two mirrored halves */
    for (const flip of [false, true]) {
      x.save();
      if (flip) { x.translate(0, H); x.scale(1, -1); }
      x.beginPath();
      x.moveTo(U(0.30), V(0.50));
      x.bezierCurveTo(U(0.60), V(0.470), U(0.76), V(0.415), U(1.0), V(0.325));
      x.lineTo(U(1.0), V(0.50));
      x.closePath();
      const g2 = x.createLinearGradient(U(0.34), 0, U(1), 0);
      g2.addColorStop(0, 'rgba(0,32,91,0)');
      g2.addColorStop(0.35, BLUE_MID);
      g2.addColorStop(1, BLUE);
      x.fillStyle = g2;
      x.fill();
      x.restore();
    }

    /* cheatline: a hairline of the tail blue running the length
       of the hull just under the window band */
    for (const v of [0.325, 0.675]) {
      x.fillStyle = BLUE;
      x.fillRect(U(geo.noseLen * 0.45), V(v) - V(0.004), U(1 - geo.noseLen * 0.45), V(0.008));
      x.fillStyle = 'rgba(31,122,224,0.55)';
      x.fillRect(U(geo.noseLen * 0.45), V(v) + V(0.006), U(1 - geo.noseLen * 0.45), V(0.004));
    }
  }

  /* ── windows ──────────────────────────────────────────── */
  const rows = geo.decks === 2 ? [0.152, 0.305, 0.695, 0.848] : [0.25, 0.75];
  const pitchM = 0.813;                          /* 32 in, the industry default */
  const winW = W * (0.29 / spec.length);
  const winH = H * 0.030;
  const step = W * (pitchM / spec.length);

  for (const v of rows) {
    const y = V(v) - winH / 2;
    let f0 = geo.winStart, f1 = geo.winEnd;
    if (geo.decks === 2 && (v < 0.2 || v > 0.8)) { f0 += 0.02; f1 -= 0.08; }
    for (let px = U(f0); px < U(f1); px += step) {
      if (emissive) {
        /* not every blind is up */
        const lit = ((px * 7919) | 0) % 10 > 2;
        if (!lit) continue;
        x.fillStyle = `rgba(255,231,186,${0.55 + (((px * 104729) | 0) % 40) / 100})`;
      } else {
        x.fillStyle = '#0e1319';
      }
      roundRect(x, px, y, winW, winH, winH * 0.34);
      x.fill();
    }
  }

  /* ── doors ────────────────────────────────────────────── */
  for (const [f, name] of geo.doors) {
    for (const v of geo.decks === 2 ? [0.305, 0.695] : [0.25, 0.75]) {
      const dw = W * (1.07 / spec.length);
      const dh = H * 0.115;
      const px = U(f) - dw / 2, py = V(v) - dh * 0.46;
      if (emissive) continue;
      x.strokeStyle = 'rgba(70,84,98,0.75)';
      x.lineWidth = Math.max(2, W / 1400);
      roundRect(x, px, py, dw, dh, dw * 0.16);
      x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.5)';
      x.fill();
      label(x, px + dw / 2, py + (v > 0.5 ? dh + H * 0.030 : -H * 0.012), (c) => {
        c.fillStyle = BLUE;
        c.font = `600 ${Math.round(H * 0.024)}px ui-sans-serif, system-ui, sans-serif`;
        c.textAlign = 'center';
        c.fillText(name, 0, 0);
      });
    }
  }

  if (!emissive) {
    /* ── titles ─────────────────────────────────────────── */
    const titleY = geo.decks === 2 ? 0.205 : 0.168;
    for (const v of [titleY, 1 - titleY]) {
      label(x, U(geo.noseLen + 0.085), V(v), (c) => {
        c.fillStyle = BLUE;
        c.font = `700 ${Math.round(H * 0.115)}px ui-sans-serif, system-ui, -apple-system, sans-serif`;
        c.textAlign = 'center';
        c.letterSpacing = `${Math.round(H * 0.014)}px`;
        c.fillText('AIRBUS', 0, 0);
      });
    }
    /* registration, aft */
    const reg = 'F-W' + type.id.slice(1).toUpperCase().padEnd(3, 'X').slice(0, 3);
    for (const v of [0.145, 0.855]) {
      label(x, U(0.905), V(v), (c) => {
        c.fillStyle = 'rgba(255,255,255,0.94)';
        c.font = `600 ${Math.round(H * 0.048)}px ui-monospace, monospace`;
        c.textAlign = 'center';
        c.fillText(reg, 0, 0);
      });
    }
    /* the aircraft's own name, forward, under the titles */
    for (const v of [titleY + 0.062, 1 - titleY - 0.062]) {
      label(x, U(geo.noseLen + 0.085), V(v), (c) => {
        c.fillStyle = 'rgba(0,32,91,0.62)';
        c.font = `600 ${Math.round(H * 0.032)}px ui-monospace, monospace`;
        c.textAlign = 'center';
        c.letterSpacing = `${Math.round(H * 0.008)}px`;
        c.fillText(type.name.toUpperCase(), 0, 0);
      });
    }

    /* service markings — small, and mostly there so the eye has
       something to scale the fuselage against */
    for (const v of [0.075, 0.925]) {
      for (const f of [0.30, 0.66]) {
        label(x, U(f), V(v), (c) => {
          c.fillStyle = 'rgba(0,32,91,0.45)';
          c.font = `600 ${Math.round(H * 0.021)}px ui-monospace, monospace`;
          c.textAlign = 'center';
          c.fillText('NO STEP', 0, 0);
        });
      }
    }
    x.fillStyle = 'rgba(0,32,91,0.40)';
    x.font = `600 ${Math.round(H * 0.022)}px ui-monospace, monospace`;
    x.textAlign = 'center';
    x.fillText(spec.engines.toUpperCase(), U(0.5), V(0.50));
  }

  return c;
}

/* ── wing upper surface ──────────────────────────────────── */

function wingCanvas(emissive) {
  const W = 1024, H = 512;
  const { c, x } = makeCanvas(W, H);
  if (emissive) { x.fillStyle = '#000'; x.fillRect(0, 0, W, H); return c; }

  const g = x.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0.00, '#e8ecf1');
  g.addColorStop(0.14, '#f5f7fa');
  g.addColorStop(0.78, '#eef1f5');
  g.addColorStop(1.00, '#dbe1e8');
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  panelLines(x, W, H, 44, 26, 0.16);

  /* the black walkway inboard, and its warning line */
  x.fillStyle = 'rgba(28,32,38,0.82)';
  x.fillRect(W * 0.16, H * 0.86, W * 0.52, H * 0.115);
  x.strokeStyle = 'rgba(200,60,40,0.8)'; x.lineWidth = 3;
  x.strokeRect(W * 0.16, H * 0.86, W * 0.52, H * 0.115);

  x.fillStyle = 'rgba(0,32,91,0.6)';
  x.font = '600 15px ui-monospace, monospace';
  x.textAlign = 'center';
  for (let i = 1; i < 6; i++) x.fillText('NO STEP', W * 0.30 + i * 60, H * 0.78);
  x.fillText('DO NOT WALK OUTSIDE THIS AREA', W * 0.42, H * 0.935);

  /* fuel panel and vent markings outboard */
  x.strokeStyle = 'rgba(90,104,120,0.5)'; x.lineWidth = 2;
  x.strokeRect(W * 0.10, H * 0.30, W * 0.06, H * 0.10);
  return c;
}

/* ── fin ─────────────────────────────────────────────────── */

function finCanvas(type, emissive) {
  const W = 1024, H = 1024;
  const { c, x } = makeCanvas(W, H);
  if (emissive) { x.fillStyle = '#000'; x.fillRect(0, 0, W, H); return c; }

  /* uv on the fin is (chord, height); a gradient across chord
     with a hard wave gives the tail its shape without any text
     borrowed from an operator */
  const g = x.createLinearGradient(0, H, W, 0);
  g.addColorStop(0.0, BLUE);
  g.addColorStop(0.55, BLUE_MID);
  g.addColorStop(1.0, BLUE_LIGHT);
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  x.save();
  x.globalCompositeOperation = 'lighter';
  x.beginPath();
  x.moveTo(0, H);
  x.bezierCurveTo(W * 0.45, H * 0.86, W * 0.62, H * 0.42, W, 0);
  x.lineTo(W, H);
  x.closePath();
  const g2 = x.createLinearGradient(0, H, W, 0);
  g2.addColorStop(0, 'rgba(31,122,224,0.0)');
  g2.addColorStop(1, 'rgba(120,200,255,0.55)');
  x.fillStyle = g2; x.fill();
  x.restore();

  x.save();
  x.translate(W * 0.44, H * 0.34);
  x.rotate(-0.16);
  x.fillStyle = 'rgba(255,255,255,0.95)';
  x.font = '700 96px ui-sans-serif, system-ui, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.letterSpacing = '10px';
  x.fillText('AIRBUS', 0, 0);
  x.font = '600 40px ui-monospace, monospace';
  x.letterSpacing = '6px';
  x.fillStyle = 'rgba(255,255,255,0.62)';
  x.fillText(type.name.toUpperCase(), 0, 78);
  x.restore();
  return c;
}

/* ── nacelle ─────────────────────────────────────────────── */

function nacelleCanvas(emissive) {
  const W = 512, H = 512;
  const { c, x } = makeCanvas(W, H);
  if (emissive) { x.fillStyle = '#000'; x.fillRect(0, 0, W, H); return c; }
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0.00, '#c9d0d8');       /* inlet lip: bare metal */
  g.addColorStop(0.10, '#f4f6f9');
  g.addColorStop(0.72, '#eef1f5');
  g.addColorStop(0.88, '#aab3bd');
  g.addColorStop(1.00, '#6f777f');
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  x.fillStyle = BLUE;
  x.fillRect(0, H * 0.12, W, H * 0.030);
  x.fillStyle = 'rgba(0,32,91,0.85)';
  x.font = '700 30px ui-sans-serif, system-ui, sans-serif';
  x.textAlign = 'center';
  x.letterSpacing = '5px';
  x.fillText('AIRBUS', W * 0.5, H * 0.34);

  /* the red danger arc every nacelle carries at the inlet */
  x.strokeStyle = 'rgba(190,40,32,0.9)'; x.lineWidth = 6;
  x.beginPath(); x.moveTo(0, H * 0.075); x.lineTo(W, H * 0.075); x.stroke();
  x.fillStyle = 'rgba(190,40,32,0.9)';
  x.font = '600 18px ui-monospace, monospace';
  x.fillText('DANGER · INTAKE', W * 0.5, H * 0.055);
  return c;
}

/* ── cache ───────────────────────────────────────────────── */

const cache = new Map();

export function liveryTextures(type) {
  if (cache.has(type.id)) return cache.get(type.id);
  const out = {
    hull: toTexture(hullCanvas(type, false)),
    hullLit: toTexture(hullCanvas(type, true)),
    wing: toTexture(wingCanvas(false)),
    tail: toTexture(finCanvas(type, false)),
    nacelle: toTexture(nacelleCanvas(false)),
    dispose() { for (const k of ['hull', 'hullLit', 'wing', 'tail', 'nacelle']) this[k].dispose(); }
  };
  cache.set(type.id, out);
  return out;
}

export { clamp, lerp };
