/* ═══════════════════════════════════════════════════════════════════
   THE ROOM

   Interiors, drawn as chiaroscuro: almost everything is a silhouette,
   and the picture is carried by four or five sources of warm light and
   what they catch on the way past. Detail is spent only where light
   lands — the lip of the counter, the top of a shoulder, the rim of a
   cup — because that is where a lens would find it too.

   Every scene composes inside a fixed virtual frame and is scaled to
   cover whatever box it is handed (see `cover` in core.js). The same
   drawing is asked for at 16:10, at 4:5 and at 9:19 behind the hero on
   a phone, and composing against the real width and height means a
   picture that works in one of those and falls apart in the rest.

   Nothing here is a photograph of Underground Cafe. These are drawings
   of a room of this kind, and the page says so where they appear.
   ═══════════════════════════════════════════════════════════════════ */

import { IN, a, mix, ellipse, pool, steam, cover, TAU } from './core.js'
import { cup, pitcher } from './vessels.js'

/* ── parts of a room ─────────────────────────────────────────────── */

/** Brick, laid in courses with a running bond. Clipped by the caller. */
function bricks(ctx, x, y, w, h, rng, unit, tint = '#2a211c') {
  const bh = unit
  const bw = unit * 2.4
  for (let row = 0, ry = y; ry < y + h; row++, ry += bh) {
    const off = row % 2 ? bw * 0.5 : 0
    for (let bx = x - bw + off; bx < x + w; bx += bw) {
      const v = rng()
      ctx.fillStyle = mix(tint, v > 0.78 ? IN.brassDim : IN.black, 0.3 + v * 0.44)
      ctx.fillRect(bx + unit * 0.07, ry + unit * 0.07, bw - unit * 0.14, bh - unit * 0.14)
    }
  }
}

/** A pendant: cord, shade, filament, and the cone it throws. */
function pendant(ctx, x, yTop, yLamp, r, strength = 1) {
  ctx.strokeStyle = a(IN.black, 0.85)
  ctx.lineWidth = Math.max(1, r * 0.07)
  ctx.beginPath()
  ctx.moveTo(x, yTop)
  ctx.lineTo(x, yLamp - r * 1.2)
  ctx.stroke()

  // The cone, drawn before the shade so the shade sits inside its own light
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  const coneH = r * 15
  const g = ctx.createLinearGradient(0, yLamp, 0, yLamp + coneH)
  g.addColorStop(0, a(IN.brassLit, 0.34 * strength))
  g.addColorStop(0.3, a(IN.brass, 0.1 * strength))
  g.addColorStop(1, a(IN.brass, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(x - r * 0.75, yLamp)
  ctx.lineTo(x + r * 0.75, yLamp)
  ctx.lineTo(x + r * 4.6, yLamp + coneH)
  ctx.lineTo(x - r * 4.6, yLamp + coneH)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // Shade
  ctx.beginPath()
  ctx.moveTo(x - r, yLamp)
  ctx.lineTo(x + r, yLamp)
  ctx.lineTo(x + r * 0.2, yLamp - r * 1.2)
  ctx.lineTo(x - r * 0.2, yLamp - r * 1.2)
  ctx.closePath()
  const sg = ctx.createLinearGradient(x - r, 0, x + r, 0)
  sg.addColorStop(0, '#1e1c1a')
  sg.addColorStop(0.3, '#453e36')
  sg.addColorStop(0.72, '#191715')
  sg.addColorStop(1, '#0e0d0c')
  ctx.fillStyle = sg
  ctx.fill()
  ctx.strokeStyle = a(IN.brass, 0.5)
  ctx.lineWidth = Math.max(1, r * 0.05)
  ctx.stroke()

  ellipse(ctx, x, yLamp, r, r * 0.26)
  ctx.fillStyle = a(IN.brassLit, 0.9)
  ctx.fill()

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  pool(ctx, x, yLamp + r * 0.1, r * 3, IN.brassLit, 0.45 * strength)
  pool(ctx, x, yLamp + r * 0.1, r * 0.8, IN.cream, 0.75 * strength)
  ctx.restore()
}

/** Dust in a beam. What makes a light source read as being in air. */
function motes(ctx, x, y, w, h, rng, n = 70) {
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  for (let i = 0; i < n; i++) {
    const t = rng()
    const mx = x + (rng() - 0.5) * w * (0.3 + t)
    const my = y + t * h
    const r = Math.max(0.7, w * 0.005 * (0.4 + rng() * 1.6))
    ctx.fillStyle = a(IN.brassLit, 0.1 + rng() * 0.42 * (1 - t))
    ctx.beginPath()
    ctx.arc(mx, my, r, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
}

/**
 * A person, seen from behind and out of focus.
 *
 * The first version of this had a head a fifth as wide as the
 * shoulders, which is roughly a chess pawn, and three of them in a row
 * made the room look haunted. A head is closer to a quarter the width
 * of a pair of shoulders and sits on a neck, and the whole shape wants
 * to be a value or two off the wall rather than pure black — a
 * silhouette that dark reads as a hole cut in the picture.
 */
function figure(ctx, x, yShoulder, s, rng, o = {}) {
  const { tone = '#131113', lean = 0, rim = 0.3 } = o
  ctx.save()
  ctx.translate(x, yShoulder)
  ctx.rotate(lean)

  const halfW = s * 0.5
  ctx.fillStyle = tone
  ctx.beginPath()
  ctx.moveTo(-halfW * 1.18, s * 1.5)
  ctx.bezierCurveTo(-halfW * 1.1, s * 0.32, -halfW * 0.98, s * 0.1, -halfW * 0.62, -s * 0.02)
  ctx.quadraticCurveTo(-halfW * 0.34, -s * 0.08, -halfW * 0.3, -s * 0.2)
  ctx.lineTo(halfW * 0.3, -s * 0.2)
  ctx.quadraticCurveTo(halfW * 0.34, -s * 0.08, halfW * 0.62, -s * 0.02)
  ctx.bezierCurveTo(halfW * 0.98, s * 0.1, halfW * 1.1, s * 0.32, halfW * 1.18, s * 1.5)
  ctx.closePath()
  ctx.fill()

  // Neck, then head. The first version had the head sitting straight on
  // the shoulders at a third of their width, which is a hooded cloak.
  ctx.beginPath()
  ctx.roundRect(-halfW * 0.17, -s * 0.34, halfW * 0.34, s * 0.2, halfW * 0.08)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(0, -s * 0.52, halfW * 0.25, halfW * 0.3, 0, 0, TAU)
  ctx.fill()

  // A single warm edge, on the side the key is
  ctx.strokeStyle = a(IN.brassLit, rim)
  ctx.lineWidth = s * 0.035
  ctx.beginPath()
  ctx.moveTo(-halfW * 1.14, s * 1.3)
  ctx.bezierCurveTo(-halfW * 1.06, s * 0.32, -halfW * 0.96, s * 0.1, -halfW * 0.6, -s * 0.02)
  ctx.stroke()
  ctx.lineWidth = s * 0.022
  ctx.beginPath()
  ctx.ellipse(0, -s * 0.52, halfW * 0.25, halfW * 0.3, 0, Math.PI * 0.95, Math.PI * 1.42)
  ctx.stroke()

  ctx.restore()
}

/**
 * The espresso machine. A wide dark slab with a lit brass band, two
 * group heads with their portafilters in, and a row of cups warming on
 * the roof — read at any size by silhouette and by where the light is.
 */
function machine(ctx, x, yBase, w, rng) {
  const h = w * 0.62
  const top = yBase - h

  ctx.save()

  // Roof tray with cups
  const trayY = top - w * 0.02
  ctx.beginPath()
  ctx.roundRect(x - w * 0.5, trayY, w, w * 0.03, w * 0.01)
  ctx.fillStyle = '#3d3833'
  ctx.fill()
  for (let i = 0; i < 6; i++) {
    const cx = x - w * 0.4 + (i * w * 0.8) / 5
    const cw = w * 0.075
    ctx.beginPath()
    ctx.roundRect(cx - cw / 2, trayY - cw * 0.62, cw, cw * 0.62, cw * 0.1)
    ctx.fillStyle = a(IN.cream, 0.32)
    ctx.fill()
    ellipse(ctx, cx, trayY - cw * 0.62, cw * 0.5, cw * 0.14)
    ctx.fillStyle = a(IN.cream, 0.6)
    ctx.fill()
  }

  // Body
  ctx.beginPath()
  ctx.roundRect(x - w * 0.5, top, w, h, [w * 0.035, w * 0.035, 0, 0])
  const g = ctx.createLinearGradient(x - w * 0.5, top, x + w * 0.5, yBase)
  g.addColorStop(0, '#2c2823')
  g.addColorStop(0.18, '#574f45')
  g.addColorStop(0.5, '#211e1b')
  g.addColorStop(1, '#0f0e0d')
  ctx.fillStyle = g
  ctx.fill()

  // Brass band across the fascia — the machine's one bright line
  ctx.beginPath()
  ctx.roundRect(x - w * 0.46, top + h * 0.16, w * 0.92, h * 0.13, w * 0.012)
  const bg = ctx.createLinearGradient(x - w * 0.46, 0, x + w * 0.46, 0)
  bg.addColorStop(0, a(IN.brassDim, 0.7))
  bg.addColorStop(0.35, a(IN.brassLit, 0.85))
  bg.addColorStop(1, a(IN.brassDim, 0.5))
  ctx.fillStyle = bg
  ctx.fill()

  // Two group heads, portafilters in, handles toward the camera
  for (const dx of [-0.22, 0.22]) {
    const gx = x + w * dx
    const gy = top + h * 0.5
    ctx.beginPath()
    ctx.roundRect(gx - w * 0.1, gy, w * 0.2, h * 0.2, w * 0.018)
    const hg = ctx.createLinearGradient(gx, gy, gx, gy + h * 0.2)
    hg.addColorStop(0, '#1c1917')
    hg.addColorStop(0.35, '#100e0d')
    hg.addColorStop(1, '#080707')
    ctx.fillStyle = hg
    ctx.fill()
    ctx.strokeStyle = a(IN.brass, 0.7)
    ctx.lineWidth = w * 0.009
    ctx.stroke()
    // The light lands on the top edge of the casting, not inside it
    ctx.beginPath()
    ctx.moveTo(gx - w * 0.09, gy + w * 0.004)
    ctx.lineTo(gx + w * 0.09, gy + w * 0.004)
    ctx.strokeStyle = a(IN.brassLit, 0.55)
    ctx.lineWidth = w * 0.006
    ctx.stroke()
    // Portafilter: a bar across, then the handle coming forward
    ctx.beginPath()
    ctx.roundRect(gx - w * 0.115, gy + h * 0.2, w * 0.23, h * 0.06, w * 0.01)
    ctx.fillStyle = '#241f1b'
    ctx.fill()
    ctx.fillStyle = a(IN.brass, 0.4)
    ctx.fillRect(gx - w * 0.115, gy + h * 0.2, w * 0.23, Math.max(1, h * 0.008))
    // Two spouts under it
    for (const sx of [-0.03, 0.03]) {
      ctx.beginPath()
      ctx.roundRect(gx + w * sx - w * 0.012, gy + h * 0.26, w * 0.024, h * 0.04, w * 0.008)
      ctx.fillStyle = '#0d0c0b'
      ctx.fill()
    }
    ctx.beginPath()
    ctx.roundRect(gx - w * 0.022, gy + h * 0.3, w * 0.044, h * 0.16, w * 0.014)
    ctx.fillStyle = '#0d0c0b'
    ctx.fill()
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    pool(ctx, gx, gy + h * 0.24, w * 0.1, IN.brassLit, 0.28)
    ctx.restore()
  }

  // Steam wands, one each side
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.moveTo(x + s * w * 0.47, top + h * 0.34)
    ctx.quadraticCurveTo(x + s * w * 0.55, top + h * 0.6, x + s * w * 0.45, top + h * 0.86)
    ctx.strokeStyle = a(IN.cool, 0.45)
    ctx.lineWidth = w * 0.016
    ctx.stroke()
  }

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  pool(ctx, x - w * 0.18, top + h * 0.3, w * 0.55, IN.brassLit, 0.2)
  ctx.restore()
  ctx.restore()
}

/** A counter slab: a dark plane with a lit front lip and a reflection. */
function counter(ctx, w, h, yTop, o = {}) {
  const { tilt = 0.06, reflect = true, front = true } = o
  const yLeft = yTop
  const yRight = yTop + h * tilt
  ctx.beginPath()
  ctx.moveTo(-w * 0.05, yLeft)
  ctx.lineTo(w * 1.05, yRight)
  ctx.lineTo(w * 1.05, h * 1.1)
  ctx.lineTo(-w * 0.05, h * 1.1)
  ctx.closePath()
  const g = ctx.createLinearGradient(0, yLeft, 0, h)
  g.addColorStop(0, '#272219')
  g.addColorStop(0.06, '#191512')
  g.addColorStop(1, '#0a0909')
  ctx.fillStyle = g
  ctx.fill()

  if (front) {
    // Vertical panelling on the front face, so it is joinery not a void
    ctx.save()
    ctx.globalAlpha = 0.5
    for (let x = 0; x < w; x += w * 0.055) {
      ctx.strokeStyle = a(IN.black, 0.6)
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.moveTo(x, yTop + h * 0.03)
      ctx.lineTo(x, h * 1.1)
      ctx.stroke()
    }
    ctx.restore()
  }

  // The lit lip — the single brightest line in most of these pictures
  ctx.beginPath()
  ctx.moveTo(-w * 0.05, yLeft)
  ctx.lineTo(w * 1.05, yRight)
  ctx.strokeStyle = a(IN.brassLit, 0.65)
  ctx.lineWidth = Math.max(1.4, h * 0.005)
  ctx.stroke()

  if (reflect) {
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    const r = ctx.createLinearGradient(0, yTop, 0, yTop + h * 0.16)
    r.addColorStop(0, a(IN.brass, 0.2))
    r.addColorStop(1, a(IN.brass, 0))
    ctx.fillStyle = r
    ctx.fillRect(0, yTop, w, h * 0.16)
    ctx.restore()
  }
}

/** Backbar shelving: bottles and cups, backlit, mostly out of focus. */
function shelf(ctx, x, y, w, h, rng, rows = 3) {
  const sh = h / rows
  for (let r = 0; r < rows; r++) {
    const sy = y + r * sh
    const deck = sy + sh * 0.88

    // The light strip under each shelf is what the bottles stand against
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    const g = ctx.createLinearGradient(0, sy + sh * 0.2, 0, deck)
    g.addColorStop(0, a(IN.brass, 0))
    g.addColorStop(1, a(IN.brassLit, 0.34))
    ctx.fillStyle = g
    ctx.fillRect(x, sy + sh * 0.2, w, sh * 0.68)
    ctx.restore()

    let bx = x + w * 0.015
    while (bx < x + w * 0.97) {
      const bw = w * (0.016 + rng() * 0.028)
      const bh = sh * (0.36 + rng() * 0.4)
      ctx.fillStyle = a('#0b0a0a', 0.95)
      if (rng() > 0.42) {
        // A bottle: shoulders, then a neck
        ctx.beginPath()
        ctx.moveTo(bx, deck)
        ctx.lineTo(bx, deck - bh * 0.62)
        ctx.quadraticCurveTo(bx, deck - bh * 0.82, bx + bw * 0.36, deck - bh * 0.88)
        ctx.lineTo(bx + bw * 0.36, deck - bh)
        ctx.lineTo(bx + bw * 0.64, deck - bh)
        ctx.lineTo(bx + bw * 0.64, deck - bh * 0.88)
        ctx.quadraticCurveTo(bx + bw, deck - bh * 0.82, bx + bw, deck - bh * 0.62)
        ctx.lineTo(bx + bw, deck)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = a(mix(IN.brass, IN.ember, rng()), 0.2 + rng() * 0.26)
        ctx.fillRect(bx + bw * 0.16, deck - bh * 0.5, bw * 0.68, bh * 0.3)
      } else {
        // A stack of cups
        const n = 2 + Math.floor(rng() * 3)
        for (let k = 0; k < n; k++) {
          ctx.fillStyle = a(IN.cream, 0.16 + k * 0.05)
          ctx.fillRect(bx, deck - (k + 1) * bw * 0.5, bw * 1.3, bw * 0.46)
        }
      }
      bx += bw * (1.9 + rng() * 1.3)
    }

    // The shelf board itself
    ctx.fillStyle = '#0a0908'
    ctx.fillRect(x, deck, w, Math.max(2, sh * 0.06))
    ctx.fillStyle = a(IN.brass, 0.3)
    ctx.fillRect(x, deck, w, Math.max(1, sh * 0.012))
  }
}

/** The lit arch behind the bar — the focal point of every wide shot. */
function niche(ctx, x, y, w, h, rng) {
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(x, y + h)
  ctx.lineTo(x, y + h * 0.42)
  ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.14, x + w, y + h * 0.42)
  ctx.lineTo(x + w, y + h)
  ctx.closePath()
  ctx.save()
  ctx.clip()
  // The wall inside the arch is warm and lit, so everything in front of
  // it separates by silhouette rather than by having its own light.
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, '#2a1d12')
  g.addColorStop(0.55, '#3b2916')
  g.addColorStop(1, '#160f0a')
  ctx.fillStyle = g
  ctx.fillRect(x, y - h * 0.2, w, h * 1.3)
  bricks(ctx, x, y - h * 0.2, w, h * 1.3, rng, h * 0.075, '#4a3520')
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  pool(ctx, x + w * 0.5, y + h * 0.55, w * 0.6, IN.brassLit, 0.3)
  ctx.restore()
  ctx.restore()
  ctx.strokeStyle = a(IN.brass, 0.55)
  ctx.lineWidth = Math.max(1.5, h * 0.008)
  ctx.stroke()
  ctx.restore()
}

/** The dark shell every interior starts from: wall, ceiling, ambient. */
function room(ctx, w, h, rng, o = {}) {
  const { wallTint = '#241b15', unit = h * 0.045, glow = 0.16 } = o
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#0d0b0c')
  g.addColorStop(0.4, '#161213')
  g.addColorStop(1, '#0a0909')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w, h)
  ctx.clip()
  bricks(ctx, 0, 0, w, h, rng, unit, wallTint)
  const wg = ctx.createLinearGradient(0, 0, 0, h)
  wg.addColorStop(0, a(IN.black, 0.94))
  wg.addColorStop(0.5, a(IN.black, 0.5))
  wg.addColorStop(1, a(IN.black, 0.86))
  ctx.fillStyle = wg
  ctx.fillRect(0, 0, w, h)
  ctx.restore()

  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  pool(ctx, w * 0.5, h * 0.44, Math.max(w, h) * 0.6, IN.brass, glow)
  ctx.restore()
}

/* ═══════════════════════════════════════════════════════════════════
   THE SCENES

   Each one wraps its drawing in `cover` so the composition survives
   every crop the layout asks for.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Compose, then cover — but pick the virtual frame to match the crop.
 *
 * Covering a 16:9 composition into a 9:19 phone hero shows about a
 * quarter of it, which is not a wide shot of a room, it is a close-up
 * of three bottles. So each scene gives two virtual frames, landscape
 * and portrait, and since every element inside is positioned as a
 * fraction of W and H, handing it the portrait box re-lays the same
 * room out tall rather than cropping the wide one.
 */
const frame = (ctx, w, h, land, port, anchorY, draw) => {
  const [vw, vh] = w / h > 1.05 ? land : port
  ctx.save()
  cover(ctx, w, h, vw, vh, anchorY)
  draw(vw, vh)
  ctx.restore()
}

export const scenes = {
  /** The establishing shot behind the hero. Wide, deep, mostly dark. */
  hero(ctx, w, h, rng) {
    frame(ctx, w, h, [1600, 900], [1000, 1250], 0.62, (W, H) => {
      room(ctx, W, H, rng, { unit: H * 0.028, glow: 0.12 })

      // The lit arch, and the backbar standing in front of it
      niche(ctx, W * 0.26, H * 0.14, W * 0.48, H * 0.62, rng)
      shelf(ctx, W * 0.3, H * 0.24, W * 0.4, H * 0.34, rng, 3)

      // Pendants
      pendant(ctx, W * 0.13, 0, H * 0.26, W * 0.032, 1)
      pendant(ctx, W * 0.87, 0, H * 0.3, W * 0.032, 1)
      pendant(ctx, W * 0.5, 0, H * 0.1, W * 0.026, 0.6)

      motes(ctx, W * 0.13, H * 0.26, W * 0.16, H * 0.6, rng, 60)
      motes(ctx, W * 0.87, H * 0.3, W * 0.16, H * 0.55, rng, 50)

      // The bar
      machine(ctx, W * 0.5, H * 0.76, W * 0.21, rng)
      counter(ctx, W, H, H * 0.79, { tilt: -0.012 })

      // People at it, cropped by the edges of frame so they read as
      // part of the room rather than as three objects placed in a row
      figure(ctx, W * 0.15, H * 0.62, H * 0.2, rng, { rim: 0.34 })
      figure(ctx, W * 0.79, H * 0.6, H * 0.19, rng, { lean: -0.04, rim: 0.26 })
      figure(ctx, W * 0.93, H * 0.66, H * 0.22, rng, { tone: '#0e0c0e', rim: 0.16 })

      // Two cups on the near lip
      cup(ctx, {
        cx: W * 0.26, cy: H * 0.775, rx: W * 0.023, depth: W * 0.02, taper: 0.7,
        shell: '#ded7c8', liquid: '#3a1d0c', foam: IN.milk, art: 'rosetta',
        fill: 0.9, handle: true, saucer: true, rng,
      })
      steam(ctx, W * 0.26, H * 0.755, W * 0.02, H * 0.2, rng, 0.5)

      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      pool(ctx, W * 0.5, H * 0.72, W * 0.42, IN.brass, 0.08)
      ctx.restore()
    })
  },

  'gal-bar'(ctx, w, h, rng) {
    frame(ctx, w, h, [1200, 900], [900, 1150], 0.6, (W, H) => {
      room(ctx, W, H, rng, { unit: H * 0.05, glow: 0.14 })
      niche(ctx, W * 0.04, H * 0.06, W * 0.62, H * 0.64, rng)
      shelf(ctx, W * 0.08, H * 0.16, W * 0.54, H * 0.4, rng, 2)
      pendant(ctx, W * 0.24, 0, H * 0.14, W * 0.05, 1)
      motes(ctx, W * 0.24, H * 0.14, W * 0.24, H * 0.6, rng, 60)
      machine(ctx, W * 0.72, H * 0.74, W * 0.42, rng)
      figure(ctx, W * 0.2, H * 0.5, H * 0.26, rng, { rim: 0.32 })
      counter(ctx, W, H, H * 0.78, { tilt: 0.02 })
    })
  },

  /**
   * The picture beside the story. Composed portrait, because that is
   * the only place on the page that asks for a tall frame, and a wide
   * room cropped to 4:5 loses the two things that make it a room —
   * the depth on either side of the bar.
   */
  about(ctx, w, h, rng) {
    frame(ctx, w, h, [1250, 1000], [900, 1100], 0.55, (W, H) => {
      room(ctx, W, H, rng, { unit: H * 0.045, glow: 0.14 })
      niche(ctx, W * 0.08, H * 0.1, W * 0.84, H * 0.46, rng)
      shelf(ctx, W * 0.14, H * 0.17, W * 0.72, H * 0.3, rng, 2)

      pendant(ctx, W * 0.24, 0, H * 0.1, W * 0.07, 1)
      pendant(ctx, W * 0.76, 0, H * 0.14, W * 0.06, 0.8)
      motes(ctx, W * 0.24, H * 0.1, W * 0.3, H * 0.5, rng, 60)

      machine(ctx, W * 0.5, H * 0.66, W * 0.62, rng)
      counter(ctx, W, H, H * 0.68, { tilt: 0.006 })

      // Somebody working it, cropped by the left edge
      figure(ctx, W * 0.06, H * 0.44, H * 0.16, rng, { lean: 0.06, rim: 0.4 })

      cup(ctx, {
        cx: W * 0.76, cy: H * 0.655, rx: W * 0.075, depth: W * 0.06, taper: 0.7,
        shell: '#ded7c8', liquid: '#3a1d0c', foam: IN.milk, art: 'rosetta',
        fill: 0.92, handle: true, saucer: true, rng,
      })
      steam(ctx, W * 0.76, H * 0.63, W * 0.06, H * 0.2, rng, 0.55)
    })
  },

  'gal-pour'(ctx, w, h, rng) {
    frame(ctx, w, h, [1200, 900], [900, 1150], 0.55, (W, H) => {
      room(ctx, W, H, rng, { unit: H * 0.09, glow: 0.2 })
      counter(ctx, W, H, H * 0.68, { tilt: 0.015, front: false })

      const cx = W * 0.42
      const cy = H * 0.58
      const r = W * 0.15

      // Jug above and right, tipped into the cup
      const spout = pitcher(ctx, W * 0.78, H * 0.26, r * 0.46, -1.02)

      // The stream, leaving the metal exactly where the metal ends
      ctx.beginPath()
      ctx.moveTo(spout.x, spout.y)
      ctx.bezierCurveTo(
        spout.x - r * 0.3, spout.y + r * 0.7,
        cx + r * 0.5, cy - r * 0.7,
        cx + r * 0.16, cy - r * 0.1,
      )
      ctx.strokeStyle = a(IN.milk, 0.92)
      ctx.lineWidth = Math.max(2, r * 0.075)
      ctx.lineCap = 'round'
      ctx.stroke()

      cup(ctx, {
        cx, cy, rx: r, depth: r * 0.78, taper: 0.68,
        shell: '#e4ddcf', liquid: '#4a2a12', foam: IN.milk, art: 'rosetta',
        fill: 0.94, handle: true, saucer: true, rng,
      })

      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      pool(ctx, cx - r * 0.6, cy - r * 0.5, r * 1.5, IN.brassLit, 0.22)
      ctx.restore()
      motes(ctx, W * 0.5, H * 0.2, W * 0.3, H * 0.5, rng, 30)
    })
  },

  'gal-corner'(ctx, w, h, rng) {
    frame(ctx, w, h, [1200, 900], [900, 1150], 0.6, (W, H) => {
      room(ctx, W, H, rng, { unit: H * 0.055, glow: 0.13 })

      // Banquette
      ctx.beginPath()
      ctx.roundRect(W * 0.02, H * 0.46, W * 0.96, H * 0.34, [H * 0.06, H * 0.06, 0, 0])
      ctx.fillStyle = '#1a1413'
      ctx.fill()
      ctx.strokeStyle = a(IN.brassDim, 0.45)
      ctx.lineWidth = Math.max(1, H * 0.004)
      ctx.stroke()
      // Buttoning
      for (let i = 1; i < 8; i++) {
        ctx.beginPath()
        ctx.arc(W * (i / 8), H * 0.56, H * 0.006, 0, TAU)
        ctx.fillStyle = a(IN.brass, 0.28)
        ctx.fill()
      }

      pendant(ctx, W * 0.5, 0, H * 0.16, W * 0.055, 1)
      motes(ctx, W * 0.5, H * 0.16, W * 0.28, H * 0.5, rng, 50)

      figure(ctx, W * 0.31, H * 0.44, H * 0.2, rng, { lean: 0.04, rim: 0.3 })
      figure(ctx, W * 0.67, H * 0.46, H * 0.19, rng, { lean: -0.05, rim: 0.24 })

      // Table with two cups
      ctx.beginPath()
      ctx.roundRect(W * 0.26, H * 0.76, W * 0.48, H * 0.028, H * 0.012)
      ctx.fillStyle = '#241d18'
      ctx.fill()
      ctx.fillStyle = a(IN.brassLit, 0.5)
      ctx.fillRect(W * 0.26, H * 0.76, W * 0.48, Math.max(1.4, H * 0.004))
      for (const [dx, k] of [[0.4, 1], [0.58, 0.9]]) {
        cup(ctx, {
          cx: W * dx, cy: H * 0.735, rx: W * 0.036 * k, depth: W * 0.03 * k,
          taper: 0.7, shell: '#ddd6c7', liquid: '#3a1d0c', foam: IN.crema,
          art: 'crema', fill: 0.85, handle: true, saucer: false, rng,
        })
        steam(ctx, W * dx, H * 0.72, W * 0.03, H * 0.16, rng, 0.4)
      }
      counter(ctx, W, H, H * 0.86, { tilt: 0, reflect: false, front: false })
    })
  },

  'gal-machine'(ctx, w, h, rng) {
    frame(ctx, w, h, [1200, 900], [900, 1150], 0.5, (W, H) => {
      room(ctx, W, H, rng, { unit: H * 0.1, glow: 0.2 })

      // Close on the machine, but with enough room around it that it
      // still reads as an object on a counter rather than a wall
      machine(ctx, W * 0.52, H * 0.6, W * 0.62, rng)

      // Two streams out of the left group, into a glass
      const gx = W * 0.386
      for (const dx of [-0.012, 0.012]) {
        ctx.beginPath()
        ctx.moveTo(gx + W * dx, H * 0.63)
        ctx.lineTo(gx + W * dx * 0.5, H * 0.72)
        ctx.strokeStyle = a('#8a5423', 0.9)
        ctx.lineWidth = W * 0.009
        ctx.lineCap = 'round'
        ctx.stroke()
      }

      const gw = W * 0.1
      const gh = H * 0.14
      const gy = H * 0.8
      ctx.beginPath()
      ctx.roundRect(gx - gw / 2, gy - gh, gw, gh, [gw * 0.06, gw * 0.06, gw * 0.16, gw * 0.16])
      ctx.fillStyle = a(IN.cream, 0.07)
      ctx.fill()
      ctx.fillStyle = '#54300f'
      ctx.fillRect(gx - gw * 0.46, gy - gh * 0.5, gw * 0.92, gh * 0.46)
      ctx.fillStyle = IN.crema
      ctx.fillRect(gx - gw * 0.46, gy - gh * 0.54, gw * 0.92, gh * 0.07)
      ctx.beginPath()
      ctx.roundRect(gx - gw / 2, gy - gh, gw, gh, [gw * 0.06, gw * 0.06, gw * 0.16, gw * 0.16])
      ctx.strokeStyle = a(IN.cream, 0.45)
      ctx.lineWidth = Math.max(1.2, W * 0.004)
      ctx.stroke()

      counter(ctx, W, H, H * 0.82, { tilt: 0, front: false })
      motes(ctx, W * 0.5, H * 0.3, W * 0.5, H * 0.5, rng, 40)
    })
  },

  'gal-arch'(ctx, w, h, rng) {
    frame(ctx, w, h, [1200, 900], [900, 1150], 0.55, (W, H) => {
      room(ctx, W, H, rng, { unit: H * 0.05, wallTint: '#2a2018', glow: 0.06 })

      // The opening, with the street beyond it
      const aw = W * 0.36
      const ax = W * 0.54
      const ay = H * 0.44
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(ax - aw / 2, H * 0.92)
      ctx.lineTo(ax - aw / 2, ay)
      ctx.quadraticCurveTo(ax, ay - aw * 0.66, ax + aw / 2, ay)
      ctx.lineTo(ax + aw / 2, H * 0.92)
      ctx.closePath()
      ctx.save()
      ctx.clip()
      const dg = ctx.createLinearGradient(0, ay - aw * 0.5, 0, H)
      dg.addColorStop(0, '#f2e5ca')
      dg.addColorStop(0.42, '#cda870')
      dg.addColorStop(0.72, '#7d5730')
      dg.addColorStop(1, '#2a1c0d')
      ctx.fillStyle = dg
      ctx.fillRect(ax - aw, ay - aw, aw * 2, H)

      // A street out there: two blocks, a kerb, and a car light. Without
      // them the opening is a lamp rather than a way out of the room.
      ctx.fillStyle = a('#3d2a15', 0.55)
      ctx.fillRect(ax - aw * 0.5, H * 0.5, aw * 0.28, H * 0.16)
      ctx.fillRect(ax + aw * 0.18, H * 0.47, aw * 0.34, H * 0.19)
      ctx.fillStyle = a('#1f1408', 0.5)
      ctx.fillRect(ax - aw, H * 0.66, aw * 2, H * 0.03)
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      pool(ctx, ax + aw * 0.34, H * 0.62, aw * 0.16, IN.cream, 0.6)
      ctx.restore()

      figure(ctx, ax - aw * 0.2, H * 0.58, H * 0.1, rng, { tone: 'rgba(28,18,10,.88)', rim: 0 })
      ctx.restore()
      ctx.strokeStyle = a(IN.brass, 0.5)
      ctx.lineWidth = Math.max(1.5, H * 0.006)
      ctx.stroke()
      ctx.restore()

      // Light spilling out of it across the floor
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      const sp = ctx.createLinearGradient(0, ay, 0, H)
      sp.addColorStop(0, a(IN.brassLit, 0.26))
      sp.addColorStop(1, a(IN.brass, 0))
      ctx.fillStyle = sp
      ctx.beginPath()
      ctx.moveTo(ax - aw * 0.5, H * 0.9)
      ctx.lineTo(ax + aw * 0.5, H * 0.9)
      ctx.lineTo(ax + aw * 1.5, H)
      ctx.lineTo(ax - aw * 1.5, H)
      ctx.closePath()
      ctx.fill()
      ctx.restore()

      motes(ctx, ax, ay, aw * 0.9, H * 0.5, rng, 70)
      ctx.fillStyle = a(IN.black, 0.55)
      ctx.fillRect(0, H * 0.9, W, H * 0.12)
    })
  },

  'gal-table'(ctx, w, h, rng) {
    frame(ctx, w, h, [1200, 900], [900, 1150], 0.55, (W, H) => {
      room(ctx, W, H, rng, { unit: H * 0.09, glow: 0.22 })
      counter(ctx, W, H, H * 0.3, { tilt: 0.03, front: false })

      for (const [dx, dy, k] of [[0.34, 0.66, 1], [0.64, 0.56, 0.84]]) {
        cup(ctx, {
          cx: W * dx, cy: H * dy, rx: W * 0.13 * k, depth: W * 0.1 * k, taper: 0.7,
          shell: '#e2dbcc', liquid: '#3d1f0d', foam: IN.crema, art: 'crema',
          fill: 0.86, handle: true, saucer: true, rng,
        })
        steam(ctx, W * dx, H * dy - W * 0.04, W * 0.09, H * 0.28, rng, 0.45)
      }

      // A spoon, because a table is never just cups
      ctx.save()
      ctx.translate(W * 0.5, H * 0.86)
      ctx.rotate(-0.22)
      ctx.beginPath()
      ctx.ellipse(-W * 0.075, 0, W * 0.02, W * 0.012, 0, 0, TAU)
      ctx.fillStyle = a('#b6b1a6', 0.8)
      ctx.fill()
      ctx.fillRect(-W * 0.06, -W * 0.004, W * 0.11, W * 0.008)
      ctx.restore()
    })
  },

  extraction(ctx, w, h, rng) {
    frame(ctx, w, h, [1250, 1000], [900, 1100], 0.5, (W, H) => {
      room(ctx, W, H, rng, { unit: H * 0.07, glow: 0.2 })

      // The machine across the top — we are at the pass, looking in
      machine(ctx, W * 0.5, H * 0.46, W * 1.05, rng)

      const gx = W * 0.39
      for (const dx of [-0.016, 0.016]) {
        ctx.beginPath()
        ctx.moveTo(gx + W * dx, H * 0.55)
        ctx.bezierCurveTo(gx + W * dx, H * 0.62, gx + W * dx * 0.4, H * 0.64, gx + W * dx * 0.35, H * 0.7)
        ctx.strokeStyle = a('#93582a', 0.92)
        ctx.lineWidth = W * 0.012
        ctx.lineCap = 'round'
        ctx.stroke()
      }

      // The glass filling
      const gw = W * 0.16
      const gh = H * 0.16
      const gy = H * 0.86
      ctx.beginPath()
      ctx.roundRect(gx - gw / 2, gy - gh, gw, gh, [gw * 0.05, gw * 0.05, gw * 0.14, gw * 0.14])
      ctx.fillStyle = a(IN.cream, 0.06)
      ctx.fill()
      ctx.fillStyle = '#54300f'
      ctx.fillRect(gx - gw * 0.46, gy - gh * 0.46, gw * 0.92, gh * 0.42)
      ctx.fillStyle = IN.crema
      ctx.fillRect(gx - gw * 0.46, gy - gh * 0.5, gw * 0.92, gh * 0.08)
      ctx.beginPath()
      ctx.roundRect(gx - gw / 2, gy - gh, gw, gh, [gw * 0.05, gw * 0.05, gw * 0.14, gw * 0.14])
      ctx.strokeStyle = a(IN.cream, 0.5)
      ctx.lineWidth = Math.max(1.2, W * 0.005)
      ctx.stroke()

      counter(ctx, W, H, H * 0.86, { tilt: 0, front: false })
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      pool(ctx, gx, H * 0.66, W * 0.34, IN.brassLit, 0.26)
      ctx.restore()
      motes(ctx, W * 0.5, H * 0.4, W * 0.5, H * 0.4, rng, 34)
    })
  },

  /**
   * A map, not an embedded one.
   *
   * A default map iframe is a bright rectangle with somebody else's
   * type in it, and it lands in the middle of a dark page like a hole.
   * This is a drawn plan of a block grid at about the right density,
   * with the pin where the room is. It carries no street names, because
   * inventing street names on a map of a real place is exactly the kind
   * of small lie worth not telling — the buttons under it open the real
   * map instead.
   */
  map(ctx, w, h, rng) {
    ctx.fillStyle = '#0b0b0d'
    ctx.fillRect(0, 0, w, h)

    const grid = Math.max(w, h) * 0.115
    ctx.save()
    ctx.translate(w * 0.5, h * 0.5)
    ctx.rotate(-0.22)
    ctx.translate(-w * 0.5, -h * 0.5)

    const x0 = -w * 0.7
    const x1 = w * 1.7
    const y0 = -h * 0.9
    const y1 = h * 1.9

    for (let y = y0; y < y1; y += grid) {
      for (let x = x0; x < x1; x += grid) {
        if (rng() > 0.86) continue
        const pad = grid * (0.08 + rng() * 0.06)
        ctx.fillStyle = a(mix('#16161a', '#23232b', rng()), 0.9)
        ctx.fillRect(x + pad, y + pad, grid - pad * 2, grid - pad * 2)
      }
    }

    ctx.strokeStyle = a(IN.cream, 0.07)
    ctx.lineWidth = Math.max(1, grid * 0.03)
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

    ctx.strokeStyle = a(IN.brass, 0.2)
    ctx.lineWidth = grid * 0.16
    ctx.beginPath()
    ctx.moveTo(x0, h * 0.24)
    ctx.lineTo(x1, h * 0.24)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(w * 0.74, y0)
    ctx.lineTo(w * 0.74, y1)
    ctx.stroke()
    ctx.restore()

    const px = w * 0.5
    const py = h * 0.46
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    pool(ctx, px, py, Math.min(w, h) * 0.42, IN.brass, 0.24)
    ctx.restore()
    for (const [r, alpha] of [[0.12, 0.42], [0.19, 0.18]]) {
      ctx.beginPath()
      ctx.arc(px, py, Math.min(w, h) * r, 0, TAU)
      ctx.strokeStyle = a(IN.brass, alpha)
      ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.004)
      ctx.stroke()
    }
    const pr = Math.min(w, h) * 0.034
    ctx.beginPath()
    ctx.moveTo(px, py + pr * 2.1)
    ctx.bezierCurveTo(px - pr * 1.5, py + pr * 0.4, px - pr, py - pr * 1.6, px, py - pr * 1.6)
    ctx.bezierCurveTo(px + pr, py - pr * 1.6, px + pr * 1.5, py + pr * 0.4, px, py + pr * 2.1)
    ctx.fillStyle = IN.brassLit
    ctx.fill()
    ctx.beginPath()
    ctx.arc(px, py - pr * 0.35, pr * 0.44, 0, TAU)
    ctx.fillStyle = '#0b0b0d'
    ctx.fill()

    ctx.strokeStyle = a(IN.cream, 0.22)
    ctx.lineWidth = 1
    const t = Math.min(w, h) * 0.05
    for (const [cx, cy, sx, sy] of [
      [0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1],
    ]) {
      ctx.beginPath()
      ctx.moveTo(cx + sx * 18, cy + sy * 18 + sy * t)
      ctx.lineTo(cx + sx * 18, cy + sy * 18)
      ctx.lineTo(cx + sx * 18 + sx * t, cy + sy * 18)
      ctx.stroke()
    }
  },
}

export { pendant, bricks, figure, machine, counter, shelf, motes, room, niche }
