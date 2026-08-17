/* ═══════════════════════════════════════════════════════════════════
   THE PLACE

   Outdoor scenes: a planted terrace in open shade, sun coming through
   the canopy, rattan and stone and a lot of leaves.

   These replaced a set of dark basement interiors — brick, pendant
   lamps, an espresso machine in silhouette. That set was lit by one
   warm lamp against near-black, which is the exact opposite instrument
   to the one a garden needs, so none of it survived the change of
   direction; it was deleted rather than tinted green.

   Every scene composes inside a fixed virtual frame and is scaled to
   cover whatever box it is handed, with separate landscape and portrait
   framings — the same drawing is asked for at 16:10 in the gallery and
   at 9:19 behind the hero on a phone.

   Nothing here is a photograph of Underground. These are drawings of a
   garden terrace, and the page says so where they appear.
   ═══════════════════════════════════════════════════════════════════ */

import { IN, a, mix, ellipse, blob, pool, contact, dapple, cover, TAU, lerp } from './core.js'
import { border, cluster, pot, rattan, LEAVES, fern } from './garden.js'

/* ── parts of a terrace ──────────────────────────────────────────── */

/** Sky and canopy: the light everything else is lit by. */
function air(ctx, w, h, rng, o = {}) {
  const { warmth = 1, canopy = true } = o
  const g = ctx.createLinearGradient(w * 0.8, 0, w * 0.1, h)
  g.addColorStop(0, mix('#fff3cd', '#dfeccb', 1 - warmth))
  g.addColorStop(0.35, '#e3f0d3')
  g.addColorStop(0.7, '#c6dcb8')
  g.addColorStop(1, '#a5c39a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // The sun itself, off the top right corner
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  pool(ctx, w * 0.84, h * 0.06, Math.max(w, h) * 0.62, IN.sun, 0.55 * warmth)
  pool(ctx, w * 0.84, h * 0.06, Math.max(w, h) * 0.2, IN.sunHot, 0.55 * warmth)
  ctx.restore()

  if (canopy) {
    // Massed foliage overhead, well out of focus
    for (let i = 0; i < 10; i++) {
      const bx = rng() * w
      const by = -h * 0.05 + rng() * h * 0.34
      const br = Math.min(w, h) * (0.18 + rng() * 0.32)
      ctx.save()
      ctx.globalAlpha = 0.2 + rng() * 0.28
      blob(ctx, bx, by, br, br * 0.62, rng, 0.3, 9)
      ctx.fillStyle = mix(IN.leaf, IN.canopy, rng() * 0.8)
      ctx.fill()
      ctx.restore()
    }
  }
}

/** The floor: pale stone tiles in perspective, or decking. */
function floor(ctx, w, h, yTop, rng, o = {}) {
  const { kind = 'stone' } = o
  const g = ctx.createLinearGradient(0, yTop, 0, h)
  if (kind === 'deck') {
    g.addColorStop(0, '#a9793f')
    g.addColorStop(1, '#7a5228')
  } else {
    g.addColorStop(0, '#ded5c0')
    g.addColorStop(0.4, '#cfc5ae')
    g.addColorStop(1, '#b6ab93')
  }
  ctx.fillStyle = g
  ctx.fillRect(0, yTop, w, h - yTop)

  // Joints, converging slightly toward a vanishing point
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, yTop, w, h - yTop)
  ctx.clip()
  ctx.strokeStyle = a(IN.bark, kind === 'deck' ? 0.3 : 0.16)
  ctx.lineWidth = Math.max(1, h * 0.003)
  const vx = w * 0.55
  for (let i = -8; i <= 12; i++) {
    ctx.beginPath()
    ctx.moveTo(vx + i * w * 0.03, yTop)
    ctx.lineTo(vx + i * w * 0.22, h)
    ctx.stroke()
  }
  let y = yTop
  let step = (h - yTop) * 0.07
  while (y < h) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
    y += step
    step *= 1.34
  }
  ctx.restore()

  ctx.fillStyle = a(IN.frond, 0.14)
  ctx.fillRect(0, yTop, w, Math.max(1.2, h * 0.004))
}

/** A café table with a cup on it, seen from standing height. */
function table(ctx, x, y, r, rng, o = {}) {
  const { cups = 1 } = o
  const ry = r * 0.3
  contact(ctx, x, y + ry * 0.9, r * 1.25, ry * 0.8, 0.34)

  // Leg
  ctx.fillStyle = '#4a3b2c'
  ctx.fillRect(x - r * 0.06, y, r * 0.12, r * 0.62)
  ellipse(ctx, x, y + r * 0.64, r * 0.26, r * 0.09)
  ctx.fillStyle = '#3d3125'
  ctx.fill()

  // Top
  ellipse(ctx, x, y, r, ry)
  const g = ctx.createLinearGradient(x - r, y - ry, x + r, y + ry)
  g.addColorStop(0, '#f2ece0')
  g.addColorStop(0.45, '#e2d9c4')
  g.addColorStop(1, '#c2b79e')
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = a(IN.bark, 0.28)
  ctx.lineWidth = Math.max(1, r * 0.012)
  ctx.stroke()

  for (let i = 0; i < cups; i++) {
    const cx = x + (i - (cups - 1) / 2) * r * 0.5
    const cy = y - ry * 0.15
    const cr = r * 0.17
    contact(ctx, cx, cy + cr * 0.34, cr * 1.5, cr * 0.4, 0.3)
    ellipse(ctx, cx, cy + cr * 0.2, cr * 1.5, cr * 0.44)
    ctx.fillStyle = '#f7f3e8'
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(cx - cr, cy - cr * 0.4)
    ctx.bezierCurveTo(cx - cr, cy + cr * 0.3, cx - cr * 0.6, cy + cr * 0.44, cx, cy + cr * 0.46)
    ctx.bezierCurveTo(cx + cr * 0.6, cy + cr * 0.44, cx + cr, cy + cr * 0.3, cx + cr, cy - cr * 0.4)
    ctx.closePath()
    ctx.fillStyle = '#fffdf6'
    ctx.fill()
    ellipse(ctx, cx, cy - cr * 0.4, cr, cr * 0.3)
    ctx.fillStyle = '#efe9da'
    ctx.fill()
    ellipse(ctx, cx, cy - cr * 0.38, cr * 0.86, cr * 0.25)
    ctx.fillStyle = '#c08a4a'
    ctx.fill()
  }
}

/** A person, out of focus, at the far end of the terrace. */
function figure(ctx, x, yShoulder, s, rng, o = {}) {
  const { tone = 'rgba(30,52,38,0.55)' } = o
  ctx.save()
  ctx.translate(x, yShoulder)
  const halfW = s * 0.5
  ctx.fillStyle = tone
  ctx.beginPath()
  ctx.moveTo(-halfW * 1.16, s * 1.4)
  ctx.bezierCurveTo(-halfW * 1.08, s * 0.3, -halfW * 0.96, s * 0.08, -halfW * 0.6, -s * 0.02)
  ctx.quadraticCurveTo(-halfW * 0.32, -s * 0.08, -halfW * 0.28, -s * 0.2)
  ctx.lineTo(halfW * 0.28, -s * 0.2)
  ctx.quadraticCurveTo(halfW * 0.32, -s * 0.08, halfW * 0.6, -s * 0.02)
  ctx.bezierCurveTo(halfW * 0.96, s * 0.08, halfW * 1.08, s * 0.3, halfW * 1.16, s * 1.4)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(-halfW * 0.16, -s * 0.34, halfW * 0.32, s * 0.2, halfW * 0.08)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(0, -s * 0.52, halfW * 0.24, halfW * 0.29, 0, 0, TAU)
  ctx.fill()
  ctx.restore()
}

/** A pergola: slats overhead, and the stripes of shade they cast. */
function pergola(ctx, w, h, rng) {
  const yb = h * 0.3
  ctx.save()
  for (let i = 0; i < 9; i++) {
    const x = -w * 0.1 + (i / 8) * w * 1.2
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(x, -h * 0.02)
    ctx.lineTo(x + w * 0.05, -h * 0.02)
    ctx.lineTo(x + w * 0.16, yb)
    ctx.lineTo(x + w * 0.1, yb)
    ctx.closePath()
    ctx.fillStyle = a('#5c4022', 0.32)
    ctx.fill()
    ctx.restore()
  }
  ctx.restore()
}

/* ═══════════════════════════════════════════════════════════════════
   THE SCENES
   ═══════════════════════════════════════════════════════════════════ */

const frame = (ctx, w, h, land, port, anchorY, draw) => {
  const [vw, vh] = w / h > 1.05 ? land : port
  ctx.save()
  cover(ctx, w, h, vw, vh, anchorY)
  draw(vw, vh)
  ctx.restore()
}

export const scenes = {
  /**
   * The hero. Huge leaves framing the top and sides, sun coming through
   * from the upper right, a terrace with tables receding into greenery.
   *
   * The middle of the frame is kept deliberately open and bright: the
   * word UNDERGROUND sits across it, and a composition that is busy in
   * the centre leaves the headline nowhere to go.
   */
  hero(ctx, w, h, rng) {
    frame(ctx, w, h, [1600, 900], [1000, 1300], 0.58, (W, H) => {
      air(ctx, W, H, rng, { warmth: 1 })
      pergola(ctx, W, H, rng)

      // Planting along the back, well out of focus
      for (let i = 0; i < 6; i++) {
        const x = (i / 5) * W + (rng() - 0.5) * W * 0.1
        ctx.save()
        ctx.globalAlpha = 0.55
        cluster(ctx, x, H * 0.62, H * 0.2, rng, { count: 5, t: 0.62, kinds: ['heart', 'palm'] })
        ctx.restore()
      }

      floor(ctx, W, H, H * 0.62, rng, { kind: 'stone' })

      // Tables down the terrace, smaller as they go back
      table(ctx, W * 0.19, H * 0.86, W * 0.1, rng, { cups: 2 })
      table(ctx, W * 0.74, H * 0.76, W * 0.072, rng, { cups: 1 })
      figure(ctx, W * 0.86, H * 0.56, H * 0.16, rng)

      // Mid-ground planting, sharper
      cluster(ctx, W * 0.06, H * 0.78, H * 0.3, rng, { count: 7, t: 0.34 })
      pot(ctx, W * 0.06, H * 0.8, W * 0.07, H * 0.07)
      cluster(ctx, W * 0.95, H * 0.74, H * 0.26, rng, { count: 6, t: 0.4 })

      dapple(ctx, W, H, rng, { count: 22, alpha: 0.55, scale: 1.3 })

      // The frame of leaves. Deliberately sparse across the top and
      // weighted into the corners: the word UNDERGROUND runs across the
      // middle of this frame, and foliage in the centre leaves the
      // headline nowhere to sit.
      border(ctx, W, H, rng, { side: 'top', count: 5, scale: 1.25, depth: 0.42 })
      border(ctx, W, H, rng, { side: 'left', count: 3, scale: 1.15, depth: 0.34 })
      border(ctx, W, H, rng, { side: 'right', count: 3, scale: 1.15, depth: 0.34 })

      // A wash of sun straight through the middle, so the centre of the
      // frame is the brightest part of it
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      pool(ctx, W * 0.5, H * 0.46, Math.max(W, H) * 0.46, IN.sun, 0.3)
      ctx.restore()
    })
  },

  /** The story picture: a corner table under planting, portrait. */
  about(ctx, w, h, rng) {
    frame(ctx, w, h, [1250, 1000], [900, 1150], 0.55, (W, H) => {
      air(ctx, W, H, rng, { warmth: 0.9 })
      for (let i = 0; i < 4; i++) {
        ctx.save()
        ctx.globalAlpha = 0.5
        cluster(ctx, (i / 3) * W, H * 0.58, H * 0.24, rng, { count: 5, t: 0.6, kinds: ['heart'] })
        ctx.restore()
      }
      floor(ctx, W, H, H * 0.6, rng, { kind: 'deck' })
      rattan(ctx, W * 0.3, H * 0.86, W * 0.2, H * 0.26, rng)
      table(ctx, W * 0.58, H * 0.8, W * 0.16, rng, { cups: 2 })
      cluster(ctx, W * 0.9, H * 0.74, H * 0.3, rng, { count: 7, t: 0.3 })
      pot(ctx, W * 0.9, H * 0.76, W * 0.12, H * 0.08)
      dapple(ctx, W, H, rng, { count: 16, alpha: 0.5 })
      border(ctx, W, H, rng, { side: 'top', count: 6, scale: 1.1, depth: 0.5 })
      border(ctx, W, H, rng, { side: 'left', count: 3, scale: 0.9, depth: 0.4 })
    })
  },

  /** The escape band: a wall of foliage with the sun burning through it. */
  escape(ctx, w, h, rng) {
    frame(ctx, w, h, [1600, 800], [900, 1200], 0.5, (W, H) => {
      air(ctx, W, H, rng, { warmth: 1, canopy: false })
      // Three depths of planting, back to front
      for (const [n, t, s] of [[14, 0.7, 0.8], [10, 0.45, 1.05], [7, 0.2, 1.4]]) {
        for (let i = 0; i < n; i++) {
          ctx.save()
          ctx.translate(rng() * W, H * (0.35 + rng() * 0.75))
          ctx.rotate((rng() - 0.5) * 1.6)
          const kinds = ['monstera', 'banana', 'palm', 'heart']
          LEAVES[kinds[Math.floor(rng() * kinds.length)]](ctx, Math.min(W, H) * (0.3 + rng() * 0.4) * s, t, rng)
          ctx.restore()
        }
      }
      dapple(ctx, W, H, rng, { count: 22, alpha: 0.55, scale: 1.3 })
      border(ctx, W, H, rng, { side: 'top', count: 7, scale: 1.2, depth: 0.35 })
      border(ctx, W, H, rng, { side: 'bottom', count: 5, scale: 1.1, depth: 0.3 })
    })
  },

  'gal-terrace'(ctx, w, h, rng) {
    frame(ctx, w, h, [1200, 900], [900, 1150], 0.58, (W, H) => {
      air(ctx, W, H, rng, {})
      pergola(ctx, W, H, rng)
      floor(ctx, W, H, H * 0.58, rng, {})
      table(ctx, W * 0.3, H * 0.84, W * 0.14, rng, { cups: 2 })
      table(ctx, W * 0.72, H * 0.72, W * 0.1, rng, { cups: 1 })
      rattan(ctx, W * 0.12, H * 0.9, W * 0.16, H * 0.26, rng)
      cluster(ctx, W * 0.95, H * 0.7, H * 0.28, rng, { count: 6, t: 0.32 })
      dapple(ctx, W, H, rng, { count: 16, alpha: 0.48 })
      border(ctx, W, H, rng, { side: 'top', count: 6, scale: 1.05, depth: 0.45 })
    })
  },

  'gal-leaves'(ctx, w, h, rng) {
    frame(ctx, w, h, [1200, 900], [900, 1200], 0.5, (W, H) => {
      air(ctx, W, H, rng, { canopy: false })
      for (const [n, t, s] of [[9, 0.65, 0.9], [6, 0.35, 1.2]]) {
        for (let i = 0; i < n; i++) {
          ctx.save()
          ctx.translate(rng() * W, H * (0.3 + rng() * 0.8))
          ctx.rotate((rng() - 0.5) * 1.4)
          LEAVES[rng() > 0.5 ? 'monstera' : 'banana'](ctx, Math.min(W, H) * (0.4 + rng() * 0.4) * s, t, rng)
          ctx.restore()
        }
      }
      dapple(ctx, W, H, rng, { count: 18, alpha: 0.6, scale: 1.4 })
    })
  },

  'gal-counter'(ctx, w, h, rng) {
    frame(ctx, w, h, [1200, 900], [900, 1150], 0.55, (W, H) => {
      air(ctx, W, H, rng, { warmth: 0.8 })
      floor(ctx, W, H, H * 0.5, rng, { kind: 'deck' })
      // A counter running across, with plants along the back edge
      ctx.beginPath()
      ctx.roundRect(-W * 0.05, H * 0.56, W * 1.1, H * 0.5, W * 0.01)
      const g = ctx.createLinearGradient(0, H * 0.56, 0, H)
      g.addColorStop(0, '#efe7d5')
      g.addColorStop(0.1, '#d9cfb6')
      g.addColorStop(1, '#b3a88e')
      ctx.fillStyle = g
      ctx.fill()
      ctx.fillStyle = a(IN.white, 0.7)
      ctx.fillRect(-W * 0.05, H * 0.56, W * 1.1, Math.max(1.4, H * 0.005))
      for (let i = 0; i < 5; i++) {
        cluster(ctx, W * (0.08 + i * 0.22), H * 0.56, H * 0.13, rng, { count: 4, t: 0.34, kinds: ['heart', 'fern'] })
        pot(ctx, W * (0.08 + i * 0.22), H * 0.575, W * 0.05, H * 0.05)
      }
      table(ctx, W * 0.5, H * 0.94, W * 0.13, rng, { cups: 2 })
      dapple(ctx, W, H, rng, { count: 12, alpha: 0.44 })
      border(ctx, W, H, rng, { side: 'top', count: 5, scale: 1, depth: 0.5 })
    })
  },

  'gal-seat'(ctx, w, h, rng) {
    frame(ctx, w, h, [1200, 900], [900, 1150], 0.6, (W, H) => {
      air(ctx, W, H, rng, {})
      for (let i = 0; i < 5; i++) {
        ctx.save()
        ctx.globalAlpha = 0.45
        cluster(ctx, (i / 4) * W, H * 0.6, H * 0.26, rng, { count: 5, t: 0.62 })
        ctx.restore()
      }
      floor(ctx, W, H, H * 0.62, rng, {})
      rattan(ctx, W * 0.26, H * 0.94, W * 0.24, H * 0.34, rng)
      rattan(ctx, W * 0.74, H * 0.94, W * 0.24, H * 0.34, rng)
      table(ctx, W * 0.5, H * 0.88, W * 0.13, rng, { cups: 2 })
      cluster(ctx, W * 0.04, H * 0.82, H * 0.3, rng, { count: 6, t: 0.28 })
      dapple(ctx, W, H, rng, { count: 15, alpha: 0.5 })
      border(ctx, W, H, rng, { side: 'top', count: 6, scale: 1.05, depth: 0.45 })
    })
  },

  'gal-window'(ctx, w, h, rng) {
    frame(ctx, w, h, [1200, 900], [900, 1150], 0.5, (W, H) => {
      air(ctx, W, H, rng, { warmth: 1, canopy: false })
      // An arched opening, planting crowding both sides of it
      const aw = W * 0.42
      const ax = W * 0.5
      const ay = H * 0.42
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(ax - aw / 2, H)
      ctx.lineTo(ax - aw / 2, ay)
      ctx.quadraticCurveTo(ax, ay - aw * 0.68, ax + aw / 2, ay)
      ctx.lineTo(ax + aw / 2, H)
      ctx.closePath()
      ctx.save()
      ctx.clip()
      const g = ctx.createLinearGradient(0, ay - aw * 0.5, 0, H)
      g.addColorStop(0, '#fff6d8')
      g.addColorStop(0.5, '#e8dfc0')
      g.addColorStop(1, '#c0b79c')
      ctx.fillStyle = g
      ctx.fillRect(ax - aw, ay - aw, aw * 2, H)
      table(ctx, ax, H * 0.9, aw * 0.3, rng, { cups: 1 })
      figure(ctx, ax + aw * 0.2, H * 0.6, H * 0.14, rng, { tone: 'rgba(40,58,44,.4)' })
      ctx.restore()
      ctx.strokeStyle = a(IN.cream, 0.9)
      ctx.lineWidth = Math.max(2, H * 0.012)
      ctx.stroke()
      ctx.restore()

      // Wall either side, warm plaster
      ctx.save()
      ctx.globalCompositeOperation = 'destination-over'
      ctx.fillStyle = '#e6dcc4'
      ctx.fillRect(0, 0, W, H)
      ctx.restore()

      cluster(ctx, W * 0.06, H * 0.98, H * 0.36, rng, { count: 8, t: 0.26 })
      cluster(ctx, W * 0.94, H * 0.98, H * 0.34, rng, { count: 8, t: 0.3 })
      dapple(ctx, W, H, rng, { count: 14, alpha: 0.5 })
      border(ctx, W, H, rng, { side: 'top', count: 5, scale: 1.1, depth: 0.4 })
    })
  },

  'gal-detail'(ctx, w, h, rng) {
    frame(ctx, w, h, [1200, 900], [900, 1150], 0.5, (W, H) => {
      air(ctx, W, H, rng, { warmth: 0.9, canopy: false })
      floor(ctx, W, H, H * 0.34, rng, { kind: 'deck' })
      // A single fern in a pot, close, with the light behind it
      ctx.save()
      ctx.translate(W * 0.5, H * 0.82)
      for (let i = 0; i < 9; i++) {
        ctx.save()
        ctx.rotate(lerp(-1.2, 1.2, i / 8) + (rng() - 0.5) * 0.16)
        fern(ctx, Math.min(W, H) * (0.4 + rng() * 0.3), 0.28 + Math.abs(i / 8 - 0.5) * 0.3)
        ctx.restore()
      }
      ctx.restore()
      pot(ctx, W * 0.5, H * 0.86, W * 0.2, H * 0.16)
      dapple(ctx, W, H, rng, { count: 16, alpha: 0.55, scale: 1.2 })
    })
  },

  /**
   * A map, not an embedded one.
   *
   * A default map iframe is a bright rectangle with somebody else's
   * type in it. This is a drawn plan at about the right density, with
   * the pin where the restaurant is. It carries no street names —
   * inventing street names on a map of a real place is the kind of
   * small lie worth not telling — and the buttons under it open the
   * real map instead.
   */
  map(ctx, w, h, rng) {
    ctx.fillStyle = '#eee7d6'
    ctx.fillRect(0, 0, w, h)

    const grid = Math.max(w, h) * 0.12
    ctx.save()
    ctx.translate(w * 0.5, h * 0.5)
    ctx.rotate(-0.2)
    ctx.translate(-w * 0.5, -h * 0.5)

    const x0 = -w * 0.7
    const x1 = w * 1.7
    const y0 = -h * 0.9
    const y1 = h * 1.9

    // Blocks, with a few planted ones
    for (let y = y0; y < y1; y += grid) {
      for (let x = x0; x < x1; x += grid) {
        const r = rng()
        if (r > 0.88) continue
        const pad = grid * (0.09 + rng() * 0.06)
        ctx.fillStyle = r > 0.72 ? a(IN.sprout, 0.34) : a('#d8cfb8', 0.95)
        ctx.fillRect(x + pad, y + pad, grid - pad * 2, grid - pad * 2)
      }
    }

    ctx.strokeStyle = a('#b9ae94', 0.9)
    ctx.lineWidth = Math.max(1, grid * 0.04)
    for (let y = y0; y < y1; y += grid) {
      ctx.beginPath()
      ctx.moveTo(x0, y)
      ctx.lineTo(x1, y)
      ctx.stroke()
    }
    for (let x = x0; x < x1; x += grid) {
      ctx.beginPath()
      ctx.moveTo(x, y0)
      ctx.lineTo(x, y1)
      ctx.stroke()
    }

    ctx.strokeStyle = a(IN.gold, 0.5)
    ctx.lineWidth = grid * 0.17
    ctx.beginPath()
    ctx.moveTo(x0, h * 0.26)
    ctx.lineTo(x1, h * 0.26)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(w * 0.74, y0)
    ctx.lineTo(w * 0.74, y1)
    ctx.stroke()
    ctx.restore()

    const px = w * 0.5
    const py = h * 0.46
    ctx.save()
    ctx.globalCompositeOperation = 'multiply'
    pool(ctx, px, py, Math.min(w, h) * 0.4, IN.sprout, 0.22)
    ctx.restore()
    for (const [r, alpha] of [[0.12, 0.5], [0.19, 0.24]]) {
      ctx.beginPath()
      ctx.arc(px, py, Math.min(w, h) * r, 0, TAU)
      ctx.strokeStyle = a(IN.frond, alpha)
      ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.004)
      ctx.stroke()
    }
    const pr = Math.min(w, h) * 0.036
    ctx.beginPath()
    ctx.moveTo(px, py + pr * 2.1)
    ctx.bezierCurveTo(px - pr * 1.5, py + pr * 0.4, px - pr, py - pr * 1.6, px, py - pr * 1.6)
    ctx.bezierCurveTo(px + pr, py - pr * 1.6, px + pr * 1.5, py + pr * 0.4, px, py + pr * 2.1)
    ctx.fillStyle = IN.frond
    ctx.fill()
    ctx.beginPath()
    ctx.arc(px, py - pr * 0.35, pr * 0.42, 0, TAU)
    ctx.fillStyle = IN.cream
    ctx.fill()

    // A little planting around the pin, because the map is of a garden
    cluster(ctx, px - Math.min(w, h) * 0.22, py + Math.min(w, h) * 0.2, Math.min(w, h) * 0.1, rng, { count: 4, t: 0.3 })
    cluster(ctx, px + Math.min(w, h) * 0.24, py - Math.min(w, h) * 0.16, Math.min(w, h) * 0.09, rng, { count: 4, t: 0.34 })

    border(ctx, w, h, rng, { side: 'top', count: 4, scale: 0.7, depth: 0.3 })
    border(ctx, w, h, rng, { side: 'bottom', count: 3, scale: 0.6, depth: 0.3 })
  },
}

export { air, floor, table, figure, pergola, border, cluster, pot, rattan }
