/* ═══════════════════════════════════════════════════════════════════
   VESSELS

   Twelve drinks come out of two forms. A latte and a flat white are not
   two different pictures — they are the same cup with a different foam
   depth, a different rim ratio and a different surface pattern, which is
   also the entire difference between them on a bench.

   Everything here draws into a bounding box and returns nothing. Lighting
   is fixed: key from the upper left, cool rim down the right edge.
   ═══════════════════════════════════════════════════════════════════ */

import { IN, a, mix, ellipse, pool, contact, steam, TAU, lerp } from './core.js'

/* ── ceramic ─────────────────────────────────────────────────────── */

/**
 * A cup, seen from about thirty degrees above the rim.
 *
 * @param o.cx,o.cy   centre of the rim ellipse
 * @param o.rx        rim radius. Everything else scales off this.
 * @param o.depth     wall height in pixels
 * @param o.taper     base radius as a fraction of the rim
 * @param o.shell     ceramic colour
 * @param o.liquid    what is in it
 * @param o.foam      foam colour, or null for a black drink
 * @param o.art       'rosetta' | 'crema' | 'matcha' | 'dust' | null
 * @param o.fill      0..1 — how far up the wall the drink sits
 */
export function cup(ctx, o) {
  const {
    cx, cy, rx,
    depth = rx * 1.05,
    taper = 0.62,
    ry = rx * 0.3,
    shell = '#e8e2d6',
    liquid = IN.coffee,
    foam = null,
    art = null,
    fill = 0.74,
    handle = true,
    saucer = true,
    rng,
  } = o

  const bx = rx * taper
  const by = ry * taper
  const baseY = cy + depth

  contact(ctx, cx, baseY + ry * 0.5, rx * 1.5, ry * 0.9, 0.8)

  if (saucer) {
    const sy = baseY + ry * 0.34
    const srx = rx * 1.72
    const sry = ry * 1.72
    ctx.fillStyle = mix(shell, IN.black, 0.5)
    ellipse(ctx, cx, sy + ry * 0.16, srx, sry)
    ctx.fill()
    const sg = ctx.createLinearGradient(cx - srx, sy - sry, cx + srx, sy + sry)
    sg.addColorStop(0, mix(shell, IN.brassLit, 0.28))
    sg.addColorStop(0.5, mix(shell, IN.black, 0.34))
    sg.addColorStop(1, mix(shell, IN.black, 0.66))
    ctx.fillStyle = sg
    ellipse(ctx, cx, sy, srx, sry)
    ctx.fill()
    ctx.strokeStyle = a(IN.cream, 0.16)
    ctx.lineWidth = Math.max(1, rx * 0.014)
    ellipse(ctx, cx, sy, srx * 0.72, sry * 0.72)
    ctx.stroke()
  }

  if (handle) drawHandle(ctx, cx + rx * 0.9, cy + depth * 0.42, rx * 0.5, shell)

  // Body
  ctx.beginPath()
  ctx.moveTo(cx - rx, cy)
  ctx.bezierCurveTo(cx - rx * 0.99, cy + depth * 0.5, cx - bx * 1.02, cy + depth * 0.72, cx - bx, baseY)
  ctx.ellipse(cx, baseY, bx, by, 0, Math.PI, 0, true)
  ctx.bezierCurveTo(cx + bx * 1.02, cy + depth * 0.72, cx + rx * 0.99, cy + depth * 0.5, cx + rx, cy)
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI, false)
  ctx.closePath()

  const bg = ctx.createLinearGradient(cx - rx, cy, cx + rx, baseY)
  bg.addColorStop(0, mix(shell, IN.black, 0.42))
  bg.addColorStop(0.2, mix(shell, IN.brassLit, 0.1))
  bg.addColorStop(0.52, mix(shell, IN.black, 0.14))
  bg.addColorStop(0.86, mix(shell, IN.black, 0.62))
  bg.addColorStop(1, mix(shell, IN.cool, 0.3))
  ctx.fillStyle = bg
  ctx.fill()

  // Occlusion where the cup meets its own base
  ctx.save()
  ctx.clip()
  const oc = ctx.createLinearGradient(0, baseY - depth * 0.34, 0, baseY + by)
  oc.addColorStop(0, a(IN.black, 0))
  oc.addColorStop(1, a(IN.black, 0.62))
  ctx.fillStyle = oc
  ctx.fillRect(cx - rx, baseY - depth * 0.34, rx * 2, depth * 0.4 + by)

  // Key highlight down the left wall
  const hl = ctx.createLinearGradient(cx - rx * 0.86, cy, cx - rx * 0.2, baseY)
  hl.addColorStop(0, a(IN.cream, 0.3))
  hl.addColorStop(1, a(IN.cream, 0))
  ctx.fillStyle = hl
  ctx.fillRect(cx - rx, cy, rx, depth)
  ctx.restore()

  // Cool rim light on the right edge — the one non-warm value on the object
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(cx + rx, cy)
  ctx.bezierCurveTo(cx + rx * 0.99, cy + depth * 0.5, cx + bx * 1.02, cy + depth * 0.74, cx + bx, baseY)
  ctx.strokeStyle = a(IN.cool, 0.5)
  ctx.lineWidth = Math.max(1.2, rx * 0.035)
  ctx.stroke()
  ctx.restore()

  // Inside
  ellipse(ctx, cx, cy, rx, ry)
  const ig = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry)
  ig.addColorStop(0, mix(shell, IN.black, 0.78))
  ig.addColorStop(1, mix(shell, IN.black, 0.46))
  ctx.fillStyle = ig
  ctx.fill()

  // Drink
  const lrx = rx * lerp(taper, 1, fill) * 0.93
  const lry = ry * lerp(taper, 1, fill) * 0.93
  const ly = cy + depth * (1 - fill) * 0.42
  ellipse(ctx, cx, ly, lrx, lry)
  const lg = ctx.createRadialGradient(cx - lrx * 0.3, ly - lry * 0.4, 0, cx, ly, lrx)
  lg.addColorStop(0, mix(liquid, IN.brassLit, 0.24))
  lg.addColorStop(0.7, liquid)
  lg.addColorStop(1, mix(liquid, IN.black, 0.5))
  ctx.fillStyle = lg
  ctx.fill()

  if (foam) surface(ctx, cx, ly, lrx, lry, foam, liquid, art, rng)

  // Lip: bright across the back, dark across the front
  ctx.lineWidth = Math.max(1.4, rx * 0.042)
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, false)
  ctx.strokeStyle = a(IN.cream, 0.62)
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI, false)
  ctx.strokeStyle = a(IN.cream, 0.2)
  ctx.stroke()

  // Specular pin on the left of the lip
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  pool(ctx, cx - rx * 0.78, cy + ry * 0.12, rx * 0.3, IN.cream, 0.5)
  ctx.restore()
}

function drawHandle(ctx, hx, hy, r, shell) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.ellipse(hx, hy, r * 0.86, r, -0.12, -Math.PI * 0.62, Math.PI * 0.62)
  ctx.strokeStyle = mix(shell, IN.black, 0.5)
  ctx.lineWidth = r * 0.42
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(hx, hy, r * 0.86, r, -0.12, -Math.PI * 0.55, Math.PI * 0.3)
  ctx.strokeStyle = mix(shell, IN.cool, 0.34)
  ctx.lineWidth = r * 0.13
  ctx.stroke()
  ctx.restore()
}

/* ── the surface of the drink ────────────────────────────────────── */

function surface(ctx, cx, cy, rx, ry, foam, liquid, art, rng) {
  ctx.save()
  ellipse(ctx, cx, cy, rx, ry)
  ctx.clip()

  if (art === 'crema') {
    const g = ctx.createRadialGradient(cx - rx * 0.24, cy - ry * 0.3, 0, cx, cy, rx)
    g.addColorStop(0, IN.cremaLit)
    g.addColorStop(0.62, foam)
    g.addColorStop(1, mix(foam, IN.coffee, 0.55))
    ctx.fillStyle = g
    ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2)
    // Tiger-striping: the streaks a good shot leaves on its own surface
    if (rng) {
      for (let i = 0; i < 22; i++) {
        const t = rng()
        const th = t * TAU
        const rr = Math.sqrt(rng()) * rx * 0.92
        ctx.fillStyle = a(rng() > 0.45 ? IN.coffee : IN.cremaLit, 0.16 + rng() * 0.2)
        ctx.beginPath()
        ctx.ellipse(cx + Math.cos(th) * rr, cy + Math.sin(th) * rr * (ry / rx), rx * (0.04 + rng() * 0.1), ry * (0.06 + rng() * 0.16), th, 0, TAU)
        ctx.fill()
      }
    }
  } else if (art === 'rosetta') {
    ctx.fillStyle = mix(foam, liquid, 0.42)
    ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2)
    rosetta(ctx, cx, cy, rx, ry, foam)
  } else if (art === 'matcha') {
    const g = ctx.createRadialGradient(cx - rx * 0.3, cy - ry * 0.34, 0, cx, cy, rx)
    g.addColorStop(0, '#a8bd72')
    g.addColorStop(0.7, '#7d9550')
    g.addColorStop(1, '#4e6335')
    ctx.fillStyle = g
    ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2)
    if (rng) {
      for (let i = 0; i < 30; i++) {
        ctx.fillStyle = a('#cbd9a4', 0.1 + rng() * 0.2)
        const th = rng() * TAU
        const rr = Math.sqrt(rng()) * rx
        ctx.beginPath()
        ctx.arc(cx + Math.cos(th) * rr, cy + Math.sin(th) * rr * (ry / rx), rx * 0.03 * rng(), 0, TAU)
        ctx.fill()
      }
    }
  } else if (art === 'dust') {
    ctx.fillStyle = foam
    ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2)
    if (rng) {
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = a('#4a2c17', 0.1 + rng() * 0.3)
        const th = rng() * TAU
        const rr = Math.sqrt(rng()) * rx
        ctx.beginPath()
        ctx.arc(cx + Math.cos(th) * rr, cy + Math.sin(th) * rr * (ry / rx), rx * 0.02 * rng(), 0, TAU)
        ctx.fill()
      }
    }
  } else {
    ctx.fillStyle = foam
    ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2)
  }

  // The meniscus: a drink is always darker where it meets the wall
  const m = ctx.createRadialGradient(cx, cy, rx * 0.62, cx, cy, rx)
  m.addColorStop(0, 'rgba(0,0,0,0)')
  m.addColorStop(1, a(IN.black, 0.5))
  ctx.fillStyle = m
  ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2)
  ctx.restore()
}

/** Free-poured rosetta, drawn in stroke order: stack of leaves, then the stem. */
function rosetta(ctx, cx, cy, rx, ry, foam) {
  ctx.save()
  ctx.scale(1, ry / rx)
  const y0 = (cy * rx) / ry
  const leaves = 6
  for (let i = 0; i < leaves; i++) {
    const t = i / (leaves - 1)
    const y = y0 - rx * 0.52 + t * rx * 1.06
    const wgt = Math.sin(lerp(0.28, 0.96, t) * Math.PI) * rx * 0.78
    ctx.beginPath()
    ctx.moveTo(cx - wgt, y)
    ctx.quadraticCurveTo(cx, y - rx * 0.3, cx + wgt, y)
    ctx.quadraticCurveTo(cx, y + rx * 0.08, cx - wgt, y)
    ctx.fillStyle = a(foam, 0.94 - t * 0.12)
    ctx.fill()
  }
  ctx.beginPath()
  ctx.moveTo(cx, y0 - rx * 0.62)
  ctx.lineTo(cx, y0 + rx * 0.66)
  ctx.strokeStyle = a(foam, 0.96)
  ctx.lineWidth = rx * 0.075
  ctx.lineCap = 'round'
  ctx.stroke()
  ctx.restore()
}

/* ── glass ───────────────────────────────────────────────────────── */

/**
 * A tall glass. Transparency is faked the way it is in a photograph:
 * the drink is drawn solid, the wall is a bright edge either side, and
 * a single blown highlight sells the whole thing.
 *
 * @param o.layers  bottom-to-top colour stops, e.g. [['#3a1c0a',0.4],['#e9dcc4',1]]
 */
export function glass(ctx, o) {
  const {
    cx, cy, w, h,
    ry = w * 0.16,
    layers = [[IN.coffee, 1]],
    ice = 0,
    fill = 0.86,
    taper = 0.84,
    rng,
    garnish = null,
  } = o

  const topY = cy - h / 2
  const botY = cy + h / 2
  const trx = w / 2
  const brx = trx * taper

  contact(ctx, cx, botY + ry * 0.4, w * 0.9, ry * 0.9, 0.82)

  const wallPath = () => {
    ctx.beginPath()
    ctx.moveTo(cx - trx, topY)
    ctx.lineTo(cx - brx, botY)
    ctx.ellipse(cx, botY, brx, ry * taper, 0, Math.PI, 0, true)
    ctx.lineTo(cx + trx, topY)
    ctx.ellipse(cx, topY, trx, ry, 0, 0, Math.PI, false)
    ctx.closePath()
  }

  // Glass itself
  wallPath()
  const gg = ctx.createLinearGradient(cx - trx, 0, cx + trx, 0)
  gg.addColorStop(0, a(IN.cream, 0.12))
  gg.addColorStop(0.16, a(IN.cream, 0.03))
  gg.addColorStop(0.8, a(IN.cream, 0.02))
  gg.addColorStop(1, a(IN.cool, 0.12))
  ctx.fillStyle = gg
  ctx.fill()

  // Drink
  ctx.save()
  wallPath()
  ctx.clip()
  const liqTop = lerp(botY, topY, fill)
  const lg = ctx.createLinearGradient(0, botY, 0, liqTop)
  layers.forEach(([c, stop]) => lg.addColorStop(Math.min(1, Math.max(0, stop)), c))
  ctx.fillStyle = lg
  ctx.fillRect(cx - trx, liqTop, w, botY - liqTop + ry)

  // Ice: rounded rectangles, rotated, lighter where the light passes through
  for (let i = 0; i < ice; i++) {
    const ix = cx + (rng() - 0.5) * w * 0.62
    const iy = lerp(liqTop + ry * 0.6, botY - ry, rng())
    const s = w * (0.2 + rng() * 0.14)
    ctx.save()
    ctx.translate(ix, iy)
    ctx.rotate((rng() - 0.5) * 1.4)
    ctx.beginPath()
    ctx.roundRect(-s / 2, -s / 2, s, s * 0.86, s * 0.16)
    ctx.fillStyle = a(IN.cream, 0.13)
    ctx.fill()
    ctx.strokeStyle = a(IN.cream, 0.3)
    ctx.lineWidth = Math.max(1, w * 0.008)
    ctx.stroke()
    ctx.beginPath()
    ctx.roundRect(-s * 0.34, -s * 0.36, s * 0.3, s * 0.24, s * 0.06)
    ctx.fillStyle = a(IN.cream, 0.26)
    ctx.fill()
    ctx.restore()
  }

  // Surface of the drink
  ellipse(ctx, cx, liqTop, trx * 0.97, ry * 0.94)
  ctx.fillStyle = a(layers[layers.length - 1][0], 0.9)
  ctx.fill()
  ctx.strokeStyle = a(IN.cream, 0.22)
  ctx.lineWidth = Math.max(1, w * 0.01)
  ctx.stroke()
  ctx.restore()

  // Walls, over the drink
  ctx.save()
  ctx.lineWidth = Math.max(1.6, w * 0.022)
  ctx.beginPath()
  ctx.moveTo(cx - trx, topY)
  ctx.lineTo(cx - brx, botY)
  ctx.strokeStyle = a(IN.cream, 0.5)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx + trx, topY)
  ctx.lineTo(cx + brx, botY)
  ctx.strokeStyle = a(IN.cool, 0.55)
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(cx, topY, trx, ry, 0, 0, TAU)
  ctx.strokeStyle = a(IN.cream, 0.52)
  ctx.stroke()
  ctx.restore()

  // One blown highlight — the thing that says 'glass' more than anything else
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  const hg = ctx.createLinearGradient(cx - trx * 0.7, 0, cx - trx * 0.3, 0)
  hg.addColorStop(0, a(IN.cream, 0))
  hg.addColorStop(0.5, a(IN.cream, 0.2))
  hg.addColorStop(1, a(IN.cream, 0))
  ctx.fillStyle = hg
  ctx.fillRect(cx - trx * 0.72, topY + ry, trx * 0.44, h - ry * 2)
  ctx.restore()

  if (garnish) garnish(ctx, cx, topY, trx, ry)
}

/* ── steel ───────────────────────────────────────────────────────── */

/**
 * A milk pitcher, tipped toward the pour.
 *
 * The thing that makes a jug read as a jug rather than a paper cone is
 * the ellipse at the mouth: you are looking slightly into it, so the
 * rim is an open oval with a spout pulled out of one side, and the
 * inside of the far wall is visible and dark.
 *
 * Returns the spout tip in world coordinates. A stream drawn from a
 * guessed point instead is the difference between pouring and leaking:
 * it has to leave the metal exactly where the metal ends.
 */
export function pitcher(ctx, cx, cy, r, tilt = -1.05) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(tilt)

  const topR = r
  const botR = r * 0.72
  const hgt = r * 2.1
  const ry = r * 0.34

  // Handle, behind the body
  ctx.beginPath()
  ctx.moveTo(topR * 0.8, -hgt * 0.28)
  ctx.bezierCurveTo(topR * 1.9, -hgt * 0.16, topR * 1.9, hgt * 0.24, topR * 0.66, hgt * 0.4)
  ctx.strokeStyle = '#4c4844'
  ctx.lineWidth = r * 0.2
  ctx.lineCap = 'round'
  ctx.stroke()
  ctx.strokeStyle = a(IN.cream, 0.4)
  ctx.lineWidth = r * 0.05
  ctx.stroke()

  // Body
  ctx.beginPath()
  ctx.moveTo(-topR, -hgt * 0.5)
  ctx.lineTo(-botR, hgt * 0.5)
  ctx.ellipse(0, hgt * 0.5, botR, ry * 0.8, 0, Math.PI, 0, true)
  ctx.lineTo(topR, -hgt * 0.5)
  ctx.ellipse(0, -hgt * 0.5, topR, ry, 0, 0, Math.PI, false)
  ctx.closePath()
  const g = ctx.createLinearGradient(-topR, 0, topR, 0)
  g.addColorStop(0, '#4f4b47')
  g.addColorStop(0.22, '#cfcac2')
  g.addColorStop(0.42, '#7d7873')
  g.addColorStop(0.72, '#332f2c')
  g.addColorStop(1, '#575350')
  ctx.fillStyle = g
  ctx.fill()

  // The spout, pulled out of the near-left of the rim
  ctx.beginPath()
  ctx.moveTo(-topR * 0.86, -hgt * 0.5 - ry * 0.3)
  ctx.quadraticCurveTo(-topR * 1.5, -hgt * 0.62, -topR * 1.34, -hgt * 0.46)
  ctx.quadraticCurveTo(-topR * 1.1, -hgt * 0.4, -topR * 0.9, -hgt * 0.44)
  ctx.closePath()
  ctx.fillStyle = '#b9b4ac'
  ctx.fill()

  // The mouth: an open oval, dark inside, bright on the far lip
  ellipse(ctx, 0, -hgt * 0.5, topR, ry)
  ctx.fillStyle = '#1b1917'
  ctx.fill()
  ellipse(ctx, 0, -hgt * 0.5 + ry * 0.18, topR * 0.9, ry * 0.78)
  ctx.fillStyle = a(IN.milk, 0.92)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(0, -hgt * 0.5, topR, ry, 0, Math.PI, 0, false)
  ctx.strokeStyle = a(IN.cream, 0.8)
  ctx.lineWidth = r * 0.06
  ctx.stroke()

  ctx.restore()

  // Spout tip, rotated into world space
  const sx = -topR * 1.38
  const sy = -hgt * 0.54
  return {
    x: cx + sx * Math.cos(tilt) - sy * Math.sin(tilt),
    y: cy + sx * Math.sin(tilt) + sy * Math.cos(tilt),
  }
}

export { steam }
