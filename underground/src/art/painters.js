/* ═══════════════════════════════════════════════════════════════════
   THE REGISTRY

   One id per picture. Every painter here gets a canvas that has already
   been cleared, and is composed the same way:

       stage → subject → post

   so a cortado and a burger come out of the same room under the same
   lamp. Painters that own their whole frame (the interiors) opt out of
   the stage and draw their own ground.
   ═══════════════════════════════════════════════════════════════════ */

import { IN, a, ellipse, stage, post, steam, rngFrom, cover, TAU } from './core.js'
import { cup, glass } from './vessels.js'
import { dishes, citrusGarnish, mintGarnish } from './food.js'
import { scenes } from './scenes.js'

/* ── coffee ──────────────────────────────────────────────────────── */

const drinks = {
  espresso(ctx, w, h, rng) {
    const s = Math.min(w * 0.9, h * 1.1)
    cup(ctx, {
      cx: w * 0.5, cy: h * 0.5, rx: s * 0.2, depth: s * 0.19, taper: 0.66,
      shell: '#e6e0d3', liquid: '#2b1206', foam: IN.crema, art: 'crema',
      fill: 0.6, rng,
    })
    steam(ctx, w * 0.5, h * 0.44, s * 0.1, h * 0.4, rng, 0.8)
  },

  flatwhite(ctx, w, h, rng) {
    const s = Math.min(w * 0.9, h * 1.1)
    cup(ctx, {
      cx: w * 0.5, cy: h * 0.46, rx: s * 0.285, depth: s * 0.21, taper: 0.7,
      shell: '#eae4d7', liquid: '#4a2a12', foam: IN.milk, art: 'rosetta',
      fill: 0.9, rng,
    })
    steam(ctx, w * 0.5, h * 0.4, s * 0.13, h * 0.38, rng, 0.7)
  },

  cortado(ctx, w, h, rng) {
    glass(ctx, {
      cx: w * 0.5, cy: h * 0.53, w: Math.min(w * 0.36, h * 0.44), h: Math.min(w * 0.42, h * 0.52),
      taper: 0.78, fill: 0.82, rng,
      layers: [['#2b1408', 0], ['#5a3315', 0.42], ['#e8dcc4', 0.72], ['#f4ecdc', 1]],
    })
    steam(ctx, w * 0.5, h * 0.36, w * 0.06, h * 0.3, rng, 0.5)
  },

  v60(ctx, w, h, rng) {
    const s = Math.min(w * 0.9, h * 1.05)
    const cx = w * 0.48
    const cupY = h * 0.66

    // The cone sits *on* the cup. Standing it off to one side, which is
    // where it was, reads as a cocktail glass next to a bowl.
    const coneR = s * 0.23
    const coneY = cupY - s * 0.2
    ctx.save()
    ctx.translate(cx, coneY)
    // Body
    ctx.beginPath()
    ctx.moveTo(-coneR, 0)
    ctx.lineTo(coneR, 0)
    ctx.lineTo(0, coneR * 1.15)
    ctx.closePath()
    const cg = ctx.createLinearGradient(-coneR, 0, coneR, 0)
    cg.addColorStop(0, a(IN.cream, 0.2))
    cg.addColorStop(0.3, a(IN.cream, 0.06))
    cg.addColorStop(1, a(IN.cool, 0.16))
    ctx.fillStyle = cg
    ctx.fill()
    // Ribs, the thing that says Hario rather than funnel
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath()
      ctx.moveTo((i / 3.4) * coneR, 0)
      ctx.lineTo(0, coneR * 1.12)
      ctx.strokeStyle = a(IN.cream, 0.14)
      ctx.lineWidth = Math.max(1, s * 0.004)
      ctx.stroke()
    }
    // Paper filter, wet, sitting inside the rim
    ctx.beginPath()
    ctx.moveTo(-coneR * 0.9, coneR * 0.06)
    ctx.lineTo(coneR * 0.9, coneR * 0.06)
    ctx.lineTo(0, coneR * 1.02)
    ctx.closePath()
    ctx.fillStyle = a('#d8c8a4', 0.42)
    ctx.fill()
    // The bed of grounds
    ellipse(ctx, 0, coneR * 0.12, coneR * 0.84, coneR * 0.24)
    const bg = ctx.createRadialGradient(-coneR * 0.2, 0, 0, 0, coneR * 0.12, coneR)
    bg.addColorStop(0, '#6b3f1c')
    bg.addColorStop(1, '#2c1608')
    ctx.fillStyle = bg
    ctx.fill()
    // Rim
    ellipse(ctx, 0, 0, coneR, coneR * 0.28)
    ctx.strokeStyle = a(IN.cream, 0.55)
    ctx.lineWidth = Math.max(1.4, s * 0.007)
    ctx.stroke()
    ctx.restore()

    // The drip, from the cone's tip into the cup
    ctx.beginPath()
    ctx.moveTo(cx, coneY + coneR * 1.15)
    ctx.lineTo(cx, cupY - s * 0.02)
    ctx.strokeStyle = a('#6b3f1c', 0.75)
    ctx.lineWidth = s * 0.01
    ctx.stroke()

    cup(ctx, {
      cx, cy: cupY, rx: s * 0.235, depth: s * 0.2, taper: 0.72,
      shell: '#2a2723', liquid: '#25130a', foam: null, art: null, fill: 0.8,
      handle: false, saucer: true, rng,
    })
    steam(ctx, cx, coneY - coneR * 0.2, s * 0.1, h * 0.28, rng, 0.5)
  },

  icedlatte(ctx, w, h, rng) {
    glass(ctx, {
      cx: w * 0.5, cy: h * 0.53, w: Math.min(w * 0.4, h * 0.46), h: Math.min(w * 0.6, h * 0.74),
      taper: 0.86, fill: 0.9, ice: 5, rng,
      layers: [['#e8d8b4', 0], ['#d8c193', 0.3], ['#8a5628', 0.56], ['#3a1c0a', 0.82], ['#201006', 1]],
    })
  },

  matcha(ctx, w, h, rng) {
    const s = Math.min(w * 0.9, h * 1.1)
    cup(ctx, {
      cx: w * 0.5, cy: h * 0.46, rx: s * 0.275, depth: s * 0.23, taper: 0.74,
      shell: '#26241f', liquid: '#5d7239', foam: '#8fa75c', art: 'matcha',
      fill: 0.9, handle: false, rng,
    })
    steam(ctx, w * 0.5, h * 0.4, s * 0.12, h * 0.36, rng, 0.6)
  },

  lemonade(ctx, w, h, rng) {
    glass(ctx, {
      cx: w * 0.5, cy: h * 0.52, w: Math.min(w * 0.38, h * 0.44), h: Math.min(w * 0.56, h * 0.7),
      taper: 0.82, fill: 0.9, ice: 3, rng, garnish: mintGarnish,
      layers: [['#5d7a35', 0], ['#8aa84c', 0.4], ['#b7cf72', 1]],
    })
  },

  icedtea(ctx, w, h, rng) {
    glass(ctx, {
      cx: w * 0.5, cy: h * 0.52, w: Math.min(w * 0.38, h * 0.44), h: Math.min(w * 0.56, h * 0.7),
      taper: 0.86, fill: 0.9, ice: 5, rng, garnish: citrusGarnish('#e08a3c'),
      layers: [['#5a2c0e', 0], ['#9c5620', 0.45], ['#d99a4e', 1]],
    })
  },

  orange(ctx, w, h, rng) {
    glass(ctx, {
      cx: w * 0.5, cy: h * 0.52, w: Math.min(w * 0.36, h * 0.42), h: Math.min(w * 0.52, h * 0.66),
      taper: 0.84, fill: 0.92, rng, garnish: citrusGarnish('#e07b1e'),
      layers: [['#b8560c', 0], ['#e08a1c', 0.5], ['#f2ad3e', 1]],
    })
  },

  sparkling(ctx, w, h, rng) {
    const gw = Math.min(w * 0.36, h * 0.42)
    const gh = Math.min(w * 0.54, h * 0.68)
    glass(ctx, {
      cx: w * 0.5, cy: h * 0.52, w: gw, h: gh,
      taper: 0.88, fill: 0.88, ice: 3, rng, garnish: citrusGarnish('#a8c24a'),
      layers: [['#1c2426', 0], ['#2c3a3c', 0.5], ['#44585a', 1]],
    })
    // Bubbles, rising in three columns
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    for (let i = 0; i < 60; i++) {
      const t = rng()
      const x = w * 0.5 + (rng() - 0.5) * gw * 0.72
      const y = h * 0.52 + gh * 0.42 - t * gh * 0.78
      ctx.fillStyle = a(IN.cream, 0.14 + rng() * 0.3)
      ctx.beginPath()
      ctx.arc(x, y, gw * 0.012 * (0.4 + rng()), 0, TAU)
      ctx.fill()
    }
    ctx.restore()
  },
}

/* ── everything the page can ask for ─────────────────────────────── */

const SUBJECTS = { ...drinks, ...dishes }

/** Interiors own their whole frame — no stage, lighter grain. */
const FULL_FRAME = {
  hero: scenes.hero,
  about: scenes.about,
  'gal-bar': scenes['gal-bar'],
  'gal-pour': scenes['gal-pour'],
  'gal-corner': scenes['gal-corner'],
  'gal-machine': scenes['gal-machine'],
  'gal-arch': scenes['gal-arch'],
  'gal-table': scenes['gal-table'],
  map: scenes.map,
}

/* The still lifes are composed once inside this box and scaled to
   cover whatever the layout hands them, the same way the interiors
   are. Without it, a cup that fills a 4:3 menu card sits marooned in
   the middle of a 16:11 feature card. */
const STILL_W = 1000
const STILL_H = 760

/**
 * `wide:<dish>` — any dish, framed for the full-bleed feature band.
 *
 * Fit to the *dish*, not to the frame. Covering a 100svh band with a
 * still life composed for a menu card scales the plate to something the
 * size of a table and still leaves the top third empty, because the
 * empty part of the still life scales with it.
 *
 * The subject is pushed right of centre and the left third is left as
 * ground, because that is where the headline goes. Type over a picture
 * wants somewhere to sit that was decided when the picture was made,
 * not afterwards.
 */
function wide(ctx, w, h, rng, subject) {
  stage(ctx, w, h, rng, { horizon: 0.74, keyX: 0.66, keyY: 0.46, bokeh: 7 })
  const SUBJECT_SPAN = 700 // the dish itself, in still-life units
  const s = (w * 0.5) / SUBJECT_SPAN
  ctx.save()
  ctx.translate(w * 0.64 - STILL_W * 0.5 * s, h * 0.6 - STILL_H * 0.6 * s)
  ctx.scale(s, s)
  subject(ctx, STILL_W, STILL_H, rng)
  ctx.restore()
  post(ctx, w, h, rng, { vignette: 1, grain: 0.05, warmth: 0.06 })
}

export function paint(ctx, id, w, h) {
  const rng = rngFrom(id)
  ctx.clearRect(0, 0, w, h)

  if (id.startsWith('wide:')) {
    const subject = SUBJECTS[id.slice(5)]
    if (subject) return wide(ctx, w, h, rng, subject)
  }

  const full = FULL_FRAME[id]
  if (full) {
    full(ctx, w, h, rng)
    post(ctx, w, h, rng, {
      vignette: id === 'hero' ? 0.7 : 0.86,
      grain: 0.045,
      warmth: 0.05,
    })
    return
  }

  const subject = SUBJECTS[id]
  if (!subject) {
    // An unknown id is a mistake in the data, not something to hide:
    // draw the stage so the layout still reads, and say so in the console.
    stage(ctx, w, h, rng, {})
    post(ctx, w, h, rng, {})
    if (import.meta.env?.DEV) console.warn(`[art] no painter for "${id}"`)
    return
  }

  stage(ctx, w, h, rng, {
    horizon: 0.66,
    keyX: 0.34 + rng() * 0.2,
    keyY: 0.28,
    bokeh: 4,
  })
  ctx.save()
  cover(ctx, w, h, STILL_W, STILL_H, 0.5)
  subject(ctx, STILL_W, STILL_H, rng)
  ctx.restore()
  post(ctx, w, h, rng, { vignette: 0.9, grain: 0.05, warmth: 0.05 })
}

export const PAINTER_IDS = [
  ...Object.keys(SUBJECTS),
  ...Object.keys(SUBJECTS).map((k) => `wide:${k}`),
  ...Object.keys(FULL_FRAME),
]
