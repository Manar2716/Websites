/* ═══════════════════════════════════════════════════════════════════
   PLATES

   Every dish is built from the same handful of parts: a piece of
   crockery, a soft mass with a rim light on it, and a few small bright
   things scattered on top. A burger and a milanese are the same three
   moves in a different order.

   Each painter draws only the subject. The stage under it and the
   grain over it are added by the registry, so the whole set is lit by
   one lamp.

   Convention: the subject sits at (w/2, h*0.6) and scales off `s`.
   ═══════════════════════════════════════════════════════════════════ */

import { IN, a, mix, ellipse, blob, pool, contact, steam, TAU, lerp, clamp } from './core.js'

const S = (w, h) => Math.min(w * 0.95, h * 1.14)

/* ── crockery ────────────────────────────────────────────────────── */

function plate(ctx, cx, cy, r, tone = '#1b1a1c') {
  const ry = r * 0.32
  contact(ctx, cx, cy + ry * 0.5, r * 1.2, ry * 1.05, 0.8)
  ellipse(ctx, cx, cy, r, ry)
  const g = ctx.createLinearGradient(cx - r, cy - ry, cx + r, cy + ry)
  g.addColorStop(0, mix(tone, IN.cream, 0.3))
  g.addColorStop(0.42, mix(tone, IN.black, 0.1))
  g.addColorStop(1, mix(tone, IN.black, 0.45))
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = a(IN.cream, 0.2)
  ctx.lineWidth = Math.max(1, r * 0.012)
  ctx.stroke()
  ellipse(ctx, cx, cy, r * 0.78, ry * 0.78)
  ctx.strokeStyle = a(IN.black, 0.4)
  ctx.stroke()
  // A pinch of light on the near rim
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  pool(ctx, cx - r * 0.66, cy - ry * 0.4, r * 0.4, IN.brassLit, 0.24)
  ctx.restore()
}

function skillet(ctx, cx, cy, r) {
  const ry = r * 0.34
  contact(ctx, cx, cy + ry * 0.6, r * 1.3, ry * 1.1, 0.85)
  // Handle, going back and to the right
  ctx.save()
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx + r * 0.9, cy - ry * 0.1)
  ctx.lineTo(cx + r * 1.85, cy - ry * 0.75)
  ctx.strokeStyle = '#17161a'
  ctx.lineWidth = r * 0.17
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx + r * 0.95, cy - ry * 0.16)
  ctx.lineTo(cx + r * 1.8, cy - ry * 0.8)
  ctx.strokeStyle = a(IN.cool, 0.35)
  ctx.lineWidth = r * 0.035
  ctx.stroke()
  ctx.restore()

  ellipse(ctx, cx, cy + ry * 0.16, r, ry)
  ctx.fillStyle = '#0d0c0e'
  ctx.fill()
  ellipse(ctx, cx, cy, r, ry)
  const g = ctx.createLinearGradient(cx - r, cy - ry, cx + r, cy + ry)
  g.addColorStop(0, '#33302f')
  g.addColorStop(0.4, '#1c1a1b')
  g.addColorStop(1, '#131113')
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = a(IN.cream, 0.24)
  ctx.lineWidth = Math.max(1, r * 0.016)
  ctx.stroke()
  ellipse(ctx, cx, cy + ry * 0.06, r * 0.82, ry * 0.8)
  ctx.fillStyle = '#0f0e10'
  ctx.fill()
}

function board(ctx, cx, cy, r, rng) {
  const ry = r * 0.3
  contact(ctx, cx, cy + ry * 0.5, r * 1.2, ry, 0.78)
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(cx - r, cy - ry, r * 2, ry * 2, ry * 0.22)
  const g = ctx.createLinearGradient(cx - r, cy - ry, cx + r, cy + ry)
  g.addColorStop(0, '#4a3423')
  g.addColorStop(0.5, '#33231699')
  g.addColorStop(1, '#20150d')
  ctx.fillStyle = '#2c1d13'
  ctx.fill()
  ctx.clip()
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = a(rng() > 0.5 ? '#5c4029' : '#1a1009', 0.3 * rng())
    ctx.lineWidth = r * 0.006
    ctx.beginPath()
    const y = cy - ry + rng() * ry * 2
    ctx.moveTo(cx - r, y)
    ctx.bezierCurveTo(cx - r * 0.3, y + (rng() - 0.5) * ry * 0.2, cx + r * 0.3, y + (rng() - 0.5) * ry * 0.2, cx + r, y)
    ctx.stroke()
  }
  ctx.restore()
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  pool(ctx, cx - r * 0.5, cy - ry * 0.6, r * 0.7, IN.brassLit, 0.16)
  ctx.restore()
}

/* ── parts ───────────────────────────────────────────────────────── */

function egg(ctx, cx, cy, r, rng, runny = true) {
  blob(ctx, cx, cy, r, r * 0.74, rng, 0.13, 11)
  const g = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.3, 0, cx, cy, r)
  g.addColorStop(0, '#fbf6ea')
  g.addColorStop(0.7, '#e7dcc7')
  g.addColorStop(1, '#b8a98f')
  ctx.fillStyle = g
  ctx.fill()
  const yr = r * 0.42
  ellipse(ctx, cx + r * 0.04, cy + r * 0.02, yr, yr * 0.86)
  const yg = ctx.createRadialGradient(cx - yr * 0.3, cy - yr * 0.4, 0, cx, cy, yr)
  yg.addColorStop(0, '#ffcf5c')
  yg.addColorStop(0.6, '#f0a729')
  yg.addColorStop(1, '#b56f16')
  ctx.fillStyle = yg
  ctx.fill()
  if (runny) {
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    pool(ctx, cx - yr * 0.34, cy - yr * 0.42, yr * 0.5, IN.cream, 0.5)
    ctx.restore()
  }
}

function bread(ctx, cx, cy, w, h, rng, tone = '#c99a5e') {
  ctx.save()
  blob(ctx, cx, cy, w / 2, h / 2, rng, 0.07, 12)
  const g = ctx.createLinearGradient(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)
  g.addColorStop(0, mix(tone, IN.cream, 0.34))
  g.addColorStop(0.45, tone)
  g.addColorStop(1, mix(tone, IN.black, 0.5))
  ctx.fillStyle = g
  ctx.fill()
  ctx.clip()
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = a(mix(tone, IN.black, 0.5), 0.14 + rng() * 0.2)
    const px = cx + (rng() - 0.5) * w
    const py = cy + (rng() - 0.5) * h
    ctx.beginPath()
    ctx.ellipse(px, py, w * 0.02 * (0.4 + rng()), h * 0.04 * (0.4 + rng()), rng() * TAU, 0, TAU)
    ctx.fill()
  }
  ctx.restore()
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  pool(ctx, cx - w * 0.24, cy - h * 0.3, w * 0.32, IN.brassLit, 0.24)
  ctx.restore()
}

function herbs(ctx, cx, cy, r, rng, n = 12, color = '#5f8449') {
  for (let i = 0; i < n; i++) {
    const th = rng() * TAU
    const rr = Math.sqrt(rng()) * r
    const x = cx + Math.cos(th) * rr
    const y = cy + Math.sin(th) * rr * 0.5
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rng() * TAU)
    ctx.fillStyle = a(color, 0.6 + rng() * 0.4)
    ctx.beginPath()
    ctx.ellipse(0, 0, r * 0.055 * (0.5 + rng()), r * 0.022 * (0.5 + rng()), 0, 0, TAU)
    ctx.fill()
    ctx.restore()
  }
}

function crumbs(ctx, cx, cy, r, rng, n, color) {
  for (let i = 0; i < n; i++) {
    const th = rng() * TAU
    const rr = Math.sqrt(rng()) * r
    ctx.fillStyle = a(color, 0.5 + rng() * 0.5)
    ctx.beginPath()
    ctx.arc(cx + Math.cos(th) * rr, cy + Math.sin(th) * rr * 0.48, r * 0.016 * (0.5 + rng()), 0, TAU)
    ctx.fill()
  }
}

function sauceDrip(ctx, cx, cy, r, rng, color) {
  ctx.save()
  ctx.fillStyle = color
  blob(ctx, cx, cy, r, r * 0.34, rng, 0.22, 10)
  ctx.fill()
  ctx.globalCompositeOperation = 'screen'
  pool(ctx, cx - r * 0.3, cy - r * 0.1, r * 0.4, IN.brassLit, 0.2)
  ctx.restore()
}

/* ═══════════════════════════════════════════════════════════════════
   THE DISHES
   ═══════════════════════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════════════════════
   BUILDERS

   Three menu sections are one drawing each with a parameter on it. A
   double burger is a single with a second patty and the bun lifted; a
   margherita is the chicken pizza with the toppings list emptied. Nine
   menu items, three shapes — which is also how the kitchen thinks about
   them.
   ═══════════════════════════════════════════════════════════════════ */

function burgerVariants() {
  const build = (o = {}) => (ctx, w, h, rng) => {
    const { patties = 1, chicken = false } = o
    const s = S(w, h)
    const cx = w * 0.46
    const cy = h * 0.68
    const bw = s * 0.28
    const stack = patties * s * 0.075 + (chicken ? s * 0.02 : 0)

    board(ctx, cx + s * 0.04, cy + s * 0.03, s * 0.46, rng)

    // Chips, standing behind and to the right
    for (let i = 0; i < 9; i++) {
      const fx = cx + s * (0.3 + rng() * 0.16)
      const fy = cy - s * (0.01 + rng() * 0.07)
      ctx.save()
      ctx.translate(fx, fy)
      ctx.rotate((rng() - 0.5) * 1.1)
      ctx.beginPath()
      ctx.roundRect(-s * 0.014, -s * 0.1, s * 0.028, s * 0.2, s * 0.008)
      const fg = ctx.createLinearGradient(-s * 0.014, 0, s * 0.014, 0)
      fg.addColorStop(0, '#e8bd6a')
      fg.addColorStop(1, '#9a6d23')
      ctx.fillStyle = fg
      ctx.fill()
      ctx.restore()
    }

    // Bottom bun
    ctx.beginPath()
    ctx.moveTo(cx - bw, cy - s * 0.01)
    ctx.lineTo(cx + bw, cy - s * 0.01)
    ctx.quadraticCurveTo(cx + bw * 0.95, cy + s * 0.055, cx, cy + s * 0.06)
    ctx.quadraticCurveTo(cx - bw * 0.95, cy + s * 0.055, cx - bw, cy - s * 0.01)
    ctx.fillStyle = '#a9742f'
    ctx.fill()

    for (let i = 0; i < patties; i++) {
      const py = cy - s * 0.035 - i * s * 0.075
      ctx.save()
      blob(ctx, cx, py, bw * 1.02, s * 0.042, rng, 0.06, 12)
      const pg = ctx.createLinearGradient(0, py - s * 0.045, 0, py + s * 0.04)
      if (chicken) {
        // Crumbed, not charred: paler, and speckled rather than smooth
        pg.addColorStop(0, '#dCAA63')
        pg.addColorStop(1, '#8a5a1c')
      } else {
        pg.addColorStop(0, '#5a3319')
        pg.addColorStop(1, '#2b1509')
      }
      ctx.fillStyle = pg
      ctx.fill()
      if (chicken) {
        ctx.clip()
        for (let k = 0; k < 40; k++) {
          ctx.fillStyle = a(rng() > 0.5 ? '#f7d79a' : '#5c3a0d', 0.3 + rng() * 0.4)
          ctx.beginPath()
          ctx.ellipse(cx + (rng() - 0.5) * bw * 2, py + (rng() - 0.5) * s * 0.08,
            s * 0.008 * (0.4 + rng()), s * 0.005 * (0.4 + rng()), rng() * TAU, 0, TAU)
          ctx.fill()
        }
      }
      ctx.restore()

      // Cheese over each patty, melting off the edges
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(cx - bw * 0.98, py - s * 0.025)
      ctx.lineTo(cx + bw * 0.98, py - s * 0.025)
      ctx.lineTo(cx + bw * 0.86, py + s * 0.023)
      ctx.quadraticCurveTo(cx + bw * 0.4, py + s * 0.047, cx, py + s * 0.021)
      ctx.quadraticCurveTo(cx - bw * 0.4, py + s * 0.049, cx - bw * 0.86, py + s * 0.023)
      ctx.closePath()
      const cg = ctx.createLinearGradient(0, py - s * 0.035, 0, py + s * 0.035)
      cg.addColorStop(0, '#ffc55a')
      cg.addColorStop(1, '#d3862a')
      ctx.fillStyle = cg
      ctx.fill()
      ctx.restore()
    }

    // Leaf
    ctx.save()
    blob(ctx, cx, cy - s * 0.082 - stack + s * 0.075, bw * 1.05, s * 0.026, rng, 0.3, 14)
    ctx.fillStyle = '#5c8a3d'
    ctx.fill()
    ctx.restore()

    // Top bun
    const ty = cy - s * 0.095 - stack + s * 0.075
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(cx - bw, ty)
    ctx.bezierCurveTo(cx - bw, ty - s * 0.12, cx + bw, ty - s * 0.12, cx + bw, ty)
    ctx.closePath()
    const tg = ctx.createLinearGradient(cx - bw, ty - s * 0.115, cx + bw * 0.6, ty)
    tg.addColorStop(0, '#e0aa5f')
    tg.addColorStop(0.45, '#bb8236')
    tg.addColorStop(1, '#6d4715')
    ctx.fillStyle = tg
    ctx.fill()
    ctx.clip()
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = a('#f5e6c4', 0.65 + rng() * 0.35)
      ctx.beginPath()
      ctx.ellipse(cx + (rng() - 0.5) * bw * 1.5, ty - rng() * s * 0.1,
        s * 0.009, s * 0.005, (rng() - 0.5) * 1.4, 0, TAU)
      ctx.fill()
    }
    ctx.restore()

    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    pool(ctx, cx - bw * 0.5, ty - s * 0.08, s * 0.12, IN.brassLit, 0.34)
    ctx.restore()
  }

  return {
    burger: build(),
    burgerDouble: build({ patties: 2 }),
    burgerChicken: build({ chicken: true }),
  }
}

function pizzaVariants() {
  /** @param o.toppings list of ['colour', count, radius] specs */
  const build = (o = {}) => (ctx, w, h, rng) => {
    const { toppings = [], sauce = '#b8331a', basil = false } = o
    const s = S(w, h)
    const cx = w * 0.5
    const cy = h * 0.6
    const r = s * 0.34
    const ry = r * 0.34

    board(ctx, cx, cy + ry * 0.5, r * 1.24, rng)

    // Crust — a torus seen at an angle, so the far edge is a thin line
    // and the near edge has some height to it
    ellipse(ctx, cx, cy, r, ry)
    const crust = ctx.createLinearGradient(cx - r, cy - ry, cx + r, cy + ry)
    crust.addColorStop(0, '#e6bd78')
    crust.addColorStop(0.4, '#c1913f')
    crust.addColorStop(1, '#6d4715')
    ctx.fillStyle = crust
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(cx, cy, r, ry, 0, 0, Math.PI)
    ctx.strokeStyle = a('#3d2408', 0.5)
    ctx.lineWidth = s * 0.012
    ctx.stroke()

    // The face
    ctx.save()
    ellipse(ctx, cx, cy, r * 0.86, ry * 0.86)
    ctx.clip()
    const sg = ctx.createRadialGradient(cx - r * 0.2, cy - ry * 0.3, 0, cx, cy, r)
    sg.addColorStop(0, mix(sauce, '#e0663a', 0.3))
    sg.addColorStop(1, mix(sauce, IN.black, 0.4))
    ctx.fillStyle = sg
    ctx.fillRect(cx - r, cy - ry, r * 2, ry * 2)

    // Cheese: overlapping blobs, browned where the oven caught them
    for (let i = 0; i < 34; i++) {
      const th = rng() * TAU
      const rr = Math.sqrt(rng()) * r * 0.82
      ctx.save()
      ctx.translate(cx + Math.cos(th) * rr, cy + Math.sin(th) * rr * 0.34)
      blob(ctx, 0, 0, r * (0.1 + rng() * 0.08), ry * (0.12 + rng() * 0.1), rng, 0.18, 9)
      ctx.fillStyle = a(mix('#f4e2b0', '#c98f36', rng() * rng()), 0.9)
      ctx.fill()
      ctx.restore()
    }

    for (const [colour, count, rad, flat] of toppings) {
      for (let i = 0; i < count; i++) {
        const th = rng() * TAU
        const rr = Math.sqrt(rng()) * r * 0.78
        const x = cx + Math.cos(th) * rr
        const y = cy + Math.sin(th) * rr * 0.34
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rng() * TAU)
        ctx.beginPath()
        ctx.ellipse(0, 0, s * rad * (0.7 + rng() * 0.6), s * rad * (flat ? 0.3 : 0.6) * (0.7 + rng() * 0.6), 0, 0, TAU)
        ctx.fillStyle = colour
        ctx.fill()
        ctx.restore()
      }
    }
    ctx.restore()

    if (basil) herbs(ctx, cx, cy, r * 0.7, rng, 10, '#4d7a34')

    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    pool(ctx, cx - r * 0.3, cy - ry * 0.6, r * 0.7, IN.brassLit, 0.22)
    ctx.restore()
    steam(ctx, cx, cy - ry, s * 0.16, s * 0.34, rng, 0.45)
  }

  return {
    // The listed one: garlic sauce base, chicken, sweetcorn, peppers,
    // black olives, onion.
    pizza: build({
      sauce: '#c9a24a',
      toppings: [
        ['#e8dcc0', 16, 0.022],
        ['#f0c24a', 22, 0.009, true],
        ['#4a7a35', 12, 0.014, true],
        ['#1c1a1c', 14, 0.013],
        ['#d8cfc0', 12, 0.012, true],
      ],
    }),
    pizzaMargherita: build({ basil: true }),
    pizzaPepperoni: build({
      toppings: [['#9c2f1c', 14, 0.028, true]],
    }),
  }
}

function donerVariants() {
  const build = (o = {}) => (ctx, w, h, rng) => {
    const { meat = ['#8e4a2c', '#5c2a14'] } = o
    const s = S(w, h)
    const cx = w * 0.5
    const cy = h * 0.6

    board(ctx, cx, cy + s * 0.12, s * 0.46, rng)

    // The pitta, folded open — one lobe behind, one in front, and the
    // filling sitting in the gap. It is the fold that says pitta.
    const pw = s * 0.32
    const ph = s * 0.19

    ctx.save()
    blob(ctx, cx, cy - s * 0.03, pw, ph, rng, 0.06, 14)
    const back = ctx.createLinearGradient(cx - pw, cy - ph, cx + pw, cy + ph)
    back.addColorStop(0, '#e2c48c')
    back.addColorStop(0.5, '#c7a262')
    back.addColorStop(1, '#8a6a2e')
    ctx.fillStyle = back
    ctx.fill()
    ctx.clip()
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = a('#7d5a20', 0.16 + rng() * 0.24)
      ctx.beginPath()
      ctx.ellipse(cx + (rng() - 0.5) * pw * 2, cy - s * 0.03 + (rng() - 0.5) * ph * 2,
        s * 0.014 * rng(), s * 0.01 * rng(), rng() * TAU, 0, TAU)
      ctx.fill()
    }
    ctx.restore()

    // The inside of the pocket, before anything goes in it. Without a
    // shadow under the far lip the bread reads as one solid lump.
    ctx.save()
    ctx.beginPath()
    ctx.ellipse(cx, cy - s * 0.05, pw * 0.9, ph * 0.62, 0, 0, TAU)
    ctx.clip()
    const pocket = ctx.createLinearGradient(0, cy - s * 0.12, 0, cy + s * 0.02)
    pocket.addColorStop(0, a('#4a3410', 0.75))
    pocket.addColorStop(1, a('#4a3410', 0))
    ctx.fillStyle = pocket
    ctx.fillRect(cx - pw, cy - s * 0.14, pw * 2, ph * 1.4)
    ctx.restore()

    // Filling: salad first, then the meat over it
    for (let i = 0; i < 26; i++) {
      const x = cx + (rng() - 0.5) * pw * 1.5
      const y = cy - s * 0.05 + (rng() - 0.5) * ph * 0.7
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rng() * TAU)
      ctx.beginPath()
      ctx.ellipse(0, 0, s * 0.03 * (0.6 + rng()), s * 0.011 * (0.6 + rng()), 0, 0, TAU)
      const leaf = rng()
      ctx.fillStyle = leaf > 0.62 ? '#7ba14f' : leaf > 0.3 ? '#c8d6b4' : '#b8321c'
      ctx.fill()
      ctx.restore()
    }

    for (let i = 0; i < 22; i++) {
      const x = cx + (rng() - 0.5) * pw * 1.3
      const y = cy - s * 0.055 + (rng() - 0.5) * ph * 0.5
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate((rng() - 0.5) * 1.6)
      ctx.beginPath()
      ctx.roundRect(-s * 0.045, -s * 0.009, s * 0.09, s * 0.018, s * 0.008)
      const mg = ctx.createLinearGradient(0, -s * 0.009, 0, s * 0.009)
      mg.addColorStop(0, mix(meat[0], IN.brassLit, 0.2))
      mg.addColorStop(1, meat[1])
      ctx.fillStyle = mg
      ctx.fill()
      ctx.restore()
    }

    // The near lobe of the bread, folded up over the filling
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(cx - pw * 0.96, cy - s * 0.02)
    ctx.quadraticCurveTo(cx, cy + s * 0.06, cx + pw * 0.96, cy - s * 0.02)
    ctx.quadraticCurveTo(cx, cy + s * 0.11, cx - pw * 0.96, cy - s * 0.02)
    ctx.closePath()
    const front = ctx.createLinearGradient(0, cy - s * 0.02, 0, cy + s * 0.1)
    front.addColorStop(0, '#e6c98e')
    front.addColorStop(0.45, '#c9a45e')
    front.addColorStop(1, '#7d5d24')
    ctx.fillStyle = front
    ctx.fill()
    // The fold itself — the one line that says this is bread wrapped
    // around something rather than a filled oval
    ctx.beginPath()
    ctx.moveTo(cx - pw * 0.96, cy - s * 0.02)
    ctx.quadraticCurveTo(cx, cy + s * 0.06, cx + pw * 0.96, cy - s * 0.02)
    ctx.strokeStyle = a('#5c3f14', 0.65)
    ctx.lineWidth = s * 0.006
    ctx.stroke()
    ctx.restore()

    // Where it caught the grill
    ctx.save()
    blob(ctx, cx, cy - s * 0.03, pw, ph, rng, 0.06, 14)
    ctx.clip()
    for (let i = 0; i < 12; i++) {
      ctx.fillStyle = a('#8a5a1c', 0.1 + rng() * 0.22)
      ctx.beginPath()
      ctx.ellipse(cx + (rng() - 0.5) * pw * 1.9, cy - s * 0.03 + (rng() - 0.5) * ph * 1.9,
        s * 0.05 * rng(), s * 0.028 * rng(), rng() * TAU, 0, TAU)
      ctx.fill()
    }
    ctx.restore()

    // Two sauces, because there are two: garlic, and minty chilli
    for (const [colour, dx] of [['#f2ead6', -0.06], ['#7fa04a', 0.05]]) {
      ctx.save()
      ctx.beginPath()
      let x = cx + s * dx - s * 0.09
      ctx.moveTo(x, cy - s * 0.09)
      for (let i = 1; i <= 5; i++) {
        x += s * 0.036
        ctx.quadraticCurveTo(x - s * 0.018, cy - s * 0.09 + (i % 2 ? s * 0.022 : -s * 0.014), x, cy - s * 0.075)
      }
      ctx.strokeStyle = a(colour, 0.85)
      ctx.lineWidth = s * 0.011
      ctx.lineCap = 'round'
      ctx.stroke()
      ctx.restore()
    }

    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    pool(ctx, cx - pw * 0.4, cy - s * 0.09, s * 0.16, IN.brassLit, 0.26)
    ctx.restore()
    steam(ctx, cx, cy - s * 0.11, s * 0.14, s * 0.32, rng, 0.4)
  }

  return {
    doner: build(),
    donerChicken: build({ meat: ['#d8a862', '#8a5c1c'] }),
  }
}

export const dishes = {
  avotoast(ctx, w, h, rng) {
    const s = S(w, h)
    const cx = w * 0.5
    const cy = h * 0.62
    plate(ctx, cx, cy, s * 0.42)
    bread(ctx, cx, cy - s * 0.06, s * 0.6, s * 0.2, rng, '#c2924f')
    // Avocado, spread with a knife
    ctx.save()
    blob(ctx, cx, cy - s * 0.1, s * 0.26, s * 0.085, rng, 0.12, 12)
    const g = ctx.createLinearGradient(0, cy - s * 0.2, 0, cy)
    g.addColorStop(0, '#9cb45e')
    g.addColorStop(0.6, '#6f8f43')
    g.addColorStop(1, '#3f5a29')
    ctx.fillStyle = g
    ctx.fill()
    ctx.clip()
    for (let i = 0; i < 14; i++) {
      ctx.strokeStyle = a(i % 2 ? '#b9cd7c' : '#3d5527', 0.3)
      ctx.lineWidth = s * 0.008
      ctx.beginPath()
      const x = cx - s * 0.25 + rng() * s * 0.5
      ctx.moveTo(x, cy - s * 0.19)
      ctx.quadraticCurveTo(x + s * 0.02, cy - s * 0.13, x - s * 0.01, cy - s * 0.02)
      ctx.stroke()
    }
    ctx.restore()
    egg(ctx, cx + s * 0.02, cy - s * 0.12, s * 0.105, rng)
    crumbs(ctx, cx, cy - s * 0.1, s * 0.24, rng, 26, IN.ember)
    herbs(ctx, cx, cy - s * 0.1, s * 0.22, rng, 9, '#7ea35a')
    steam(ctx, cx, cy - s * 0.24, s * 0.15, s * 0.5, rng, 0.5)
  },

  shakshuka(ctx, w, h, rng) {
    const s = S(w, h)
    const cx = w * 0.5
    const cy = h * 0.6
    skillet(ctx, cx, cy, s * 0.4)
    ctx.save()
    ellipse(ctx, cx, cy, s * 0.33, s * 0.108)
    ctx.clip()
    const g = ctx.createRadialGradient(cx - s * 0.1, cy - s * 0.04, 0, cx, cy, s * 0.34)
    g.addColorStop(0, '#c4441f')
    g.addColorStop(0.6, '#932d13')
    g.addColorStop(1, '#5c1a0b')
    ctx.fillStyle = g
    ctx.fillRect(cx - s * 0.4, cy - s * 0.2, s * 0.8, s * 0.4)
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = a(rng() > 0.5 ? '#e0642f' : '#6d1e0c', 0.3 + rng() * 0.3)
      const th = rng() * TAU
      const rr = Math.sqrt(rng()) * s * 0.32
      ctx.beginPath()
      ctx.ellipse(cx + Math.cos(th) * rr, cy + Math.sin(th) * rr * 0.33, s * 0.02 * (0.5 + rng()), s * 0.01 * (0.5 + rng()), rng() * TAU, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
    egg(ctx, cx - s * 0.11, cy - s * 0.012, s * 0.088, rng)
    egg(ctx, cx + s * 0.1, cy + s * 0.022, s * 0.082, rng)
    herbs(ctx, cx, cy, s * 0.3, rng, 16)
    crumbs(ctx, cx, cy, s * 0.3, rng, 14, '#e9e2d2')
    steam(ctx, cx, cy - s * 0.1, s * 0.2, s * 0.62, rng, 0.9)
  },

  pancakes(ctx, w, h, rng) {
    const s = S(w, h)
    const cx = w * 0.5
    const cy = h * 0.66
    plate(ctx, cx, cy, s * 0.4)
    const pr = s * 0.23
    for (let i = 2; i >= 0; i--) {
      const y = cy - s * 0.045 - i * s * 0.078
      // The side wall of the disc, so the stack has three edges rather
      // than being one tall beige mound
      ctx.beginPath()
      ctx.moveTo(cx - pr, y)
      ctx.lineTo(cx - pr, y + s * 0.05)
      ctx.ellipse(cx, y + s * 0.05, pr, pr * 0.32, 0, Math.PI, 0, true)
      ctx.lineTo(cx + pr, y)
      ctx.ellipse(cx, y, pr, pr * 0.32, 0, 0, Math.PI, false)
      ctx.closePath()
      const wg = ctx.createLinearGradient(0, y, 0, y + s * 0.05)
      wg.addColorStop(0, '#8a5c22')
      wg.addColorStop(1, '#40270c')
      ctx.fillStyle = wg
      ctx.fill()

      ellipse(ctx, cx, y, pr, pr * 0.32)
      const g = ctx.createLinearGradient(cx - pr, y - pr * 0.3, cx + pr, y + pr * 0.3)
      g.addColorStop(0, '#ecc584')
      g.addColorStop(0.4, '#c58f4c')
      g.addColorStop(1, '#6d4718')
      ctx.fillStyle = g
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(cx, y, pr, pr * 0.32, 0, 0, Math.PI)
      ctx.strokeStyle = a('#4a2d0c', 0.75)
      ctx.lineWidth = s * 0.012
      ctx.stroke()
    }
    // Butter
    ctx.save()
    ctx.translate(cx - s * 0.02, cy - s * 0.205)
    ctx.rotate(-0.15)
    ctx.beginPath()
    ctx.roundRect(-s * 0.045, -s * 0.022, s * 0.09, s * 0.044, s * 0.008)
    ctx.fillStyle = '#f3e0a4'
    ctx.fill()
    ctx.restore()
    // Syrup, running off the near edge
    ctx.save()
    ctx.fillStyle = a('#4d2408', 0.85)
    ctx.beginPath()
    ctx.moveTo(cx - s * 0.14, cy - s * 0.2)
    ctx.bezierCurveTo(cx - s * 0.18, cy - s * 0.12, cx - s * 0.2, cy - s * 0.08, cx - s * 0.17, cy - s * 0.03)
    ctx.lineTo(cx - s * 0.13, cy - s * 0.035)
    ctx.bezierCurveTo(cx - s * 0.15, cy - s * 0.09, cx - s * 0.13, cy - s * 0.14, cx - s * 0.1, cy - s * 0.2)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    crumbs(ctx, cx, cy - s * 0.2, s * 0.19, rng, 30, '#93b25c')
    steam(ctx, cx, cy - s * 0.28, s * 0.14, s * 0.42, rng, 0.5)
  },

  benedict(ctx, w, h, rng) {
    const s = S(w, h)
    const cx = w * 0.5
    const cy = h * 0.63
    plate(ctx, cx, cy, s * 0.42)
    for (const dx of [-0.13, 0.13]) {
      const x = cx + s * dx
      ellipse(ctx, x, cy - s * 0.03, s * 0.115, s * 0.04)
      ctx.fillStyle = '#b98a4d'
      ctx.fill()
      // Ham, ruffled
      ctx.save()
      blob(ctx, x, cy - s * 0.055, s * 0.11, s * 0.036, rng, 0.2, 12)
      ctx.fillStyle = '#a8503f'
      ctx.fill()
      ctx.restore()
      egg(ctx, x, cy - s * 0.085, s * 0.095, rng)
      // Hollandaise over the top
      ctx.save()
      ctx.globalAlpha = 0.88
      blob(ctx, x, cy - s * 0.095, s * 0.085, s * 0.036, rng, 0.16, 11)
      const hg = ctx.createLinearGradient(x - s * 0.08, 0, x + s * 0.08, 0)
      hg.addColorStop(0, '#ffdc8a')
      hg.addColorStop(0.6, '#e9b855')
      hg.addColorStop(1, '#a97c23')
      ctx.fillStyle = hg
      ctx.fill()
      ctx.restore()
    }
    herbs(ctx, cx, cy - s * 0.1, s * 0.2, rng, 12, '#6f9a4e')
    steam(ctx, cx, cy - s * 0.2, s * 0.16, s * 0.44, rng, 0.6)
  },

  /* Burgers come out of one builder. A double is the same drawing with
     a second patty and the bun lifted; a chicken burger is the same
     drawing with a paler, crumbed middle. Three menu items, one shape. */
  ...burgerVariants(),

  chips(ctx, w, h, rng) {
    const s = S(w, h)
    const cx = w * 0.5
    const cy = h * 0.64
    // A steel basket, filled past the rim
    const r = s * 0.24
    contact(ctx, cx, cy + r * 0.5, r * 1.5, r * 0.4, 0.82)
    ctx.beginPath()
    ctx.moveTo(cx - r, cy - r * 0.5)
    ctx.lineTo(cx - r * 0.78, cy + r * 0.42)
    ctx.ellipse(cx, cy + r * 0.42, r * 0.78, r * 0.24, 0, Math.PI, 0, true)
    ctx.lineTo(cx + r, cy - r * 0.5)
    ctx.ellipse(cx, cy - r * 0.5, r, r * 0.3, 0, 0, Math.PI, false)
    ctx.closePath()
    const bg = ctx.createLinearGradient(cx - r, 0, cx + r, 0)
    bg.addColorStop(0, '#4a4642')
    bg.addColorStop(0.3, '#a9a49c')
    bg.addColorStop(1, '#2a2724')
    ctx.fillStyle = bg
    ctx.fill()
    // Mesh
    ctx.save()
    ctx.clip()
    ctx.strokeStyle = a(IN.black, 0.35)
    ctx.lineWidth = Math.max(1, s * 0.004)
    for (let i = -6; i <= 6; i++) {
      ctx.beginPath()
      ctx.moveTo(cx + (i / 6) * r, cy - r * 0.5)
      ctx.lineTo(cx + (i / 6) * r * 0.78, cy + r * 0.5)
      ctx.stroke()
    }
    ctx.restore()
    // Chips, heaped and pointing every which way
    for (let i = 0; i < 34; i++) {
      const t = rng()
      const fx = cx + (rng() - 0.5) * r * 1.7
      const fy = cy - r * 0.5 - t * r * 0.5 + rng() * r * 0.4
      ctx.save()
      ctx.translate(fx, fy)
      ctx.rotate((rng() - 0.5) * 2.4)
      ctx.beginPath()
      ctx.roundRect(-s * 0.016, -s * 0.085, s * 0.032, s * 0.17, s * 0.009)
      const fg = ctx.createLinearGradient(-s * 0.016, 0, s * 0.016, 0)
      fg.addColorStop(0, mix('#f0ca7c', '#c9993f', rng()))
      fg.addColorStop(1, '#8a5f18')
      ctx.fillStyle = fg
      ctx.fill()
      ctx.restore()
    }
    crumbs(ctx, cx, cy - r * 0.4, r * 1.2, rng, 18, '#f3ead4')
    steam(ctx, cx, cy - r * 0.8, s * 0.12, s * 0.34, rng, 0.4)
  },

  /**
   * The full English. Nine things on one plate, which is the whole
   * character of the dish — the drawing has to look crowded or it is
   * not a full English, it is brunch.
   */
  english(ctx, w, h, rng) {
    const s = S(w, h)
    const cx = w * 0.5
    const cy = h * 0.62
    plate(ctx, cx, cy, s * 0.46, '#1d1c1e')

    // Beans, in their own corner, with the sauce catching the light
    ctx.save()
    blob(ctx, cx + s * 0.22, cy + s * 0.02, s * 0.11, s * 0.045, rng, 0.14, 12)
    ctx.fillStyle = '#a8340f'
    ctx.fill()
    ctx.clip()
    for (let i = 0; i < 26; i++) {
      ctx.save()
      ctx.translate(cx + s * 0.22 + (rng() - 0.5) * s * 0.2, cy + s * 0.02 + (rng() - 0.5) * s * 0.08)
      ctx.rotate(rng() * Math.PI)
      ctx.beginPath()
      ctx.ellipse(0, 0, s * 0.016, s * 0.011, 0, 0, TAU)
      ctx.fillStyle = mix('#d68a3a', '#8a4a12', rng())
      ctx.fill()
      ctx.restore()
    }
    ctx.restore()

    // Two sausages
    for (const [dx, dy, rot] of [[-0.2, -0.04, -0.42], [-0.13, 0.03, -0.3]]) {
      ctx.save()
      ctx.translate(cx + s * dx, cy + s * dy)
      ctx.rotate(rot)
      ctx.beginPath()
      ctx.roundRect(-s * 0.085, -s * 0.028, s * 0.17, s * 0.056, s * 0.028)
      const sg = ctx.createLinearGradient(0, -s * 0.028, 0, s * 0.028)
      sg.addColorStop(0, '#a4622c')
      sg.addColorStop(0.4, '#7d4416')
      sg.addColorStop(1, '#42220a')
      ctx.fillStyle = sg
      ctx.fill()
      ctx.restore()
    }

    // Beef bacon, two rashers, rippled
    for (const [dx, dy] of [[-0.02, -0.11], [0.06, -0.07]]) {
      ctx.save()
      ctx.beginPath()
      const bx = cx + s * dx
      const by = cy + s * dy
      ctx.moveTo(bx - s * 0.1, by)
      ctx.quadraticCurveTo(bx - s * 0.03, by - s * 0.032, bx + s * 0.03, by)
      ctx.quadraticCurveTo(bx + s * 0.08, by + s * 0.03, bx + s * 0.12, by - s * 0.006)
      ctx.lineTo(bx + s * 0.12, by + s * 0.026)
      ctx.quadraticCurveTo(bx + s * 0.08, by + s * 0.056, bx + s * 0.03, by + s * 0.028)
      ctx.quadraticCurveTo(bx - s * 0.03, by, bx - s * 0.1, by + s * 0.03)
      ctx.closePath()
      const bg2 = ctx.createLinearGradient(bx - s * 0.1, 0, bx + s * 0.12, 0)
      bg2.addColorStop(0, '#b8563c')
      bg2.addColorStop(0.5, '#8e3320')
      bg2.addColorStop(1, '#5c1e10')
      ctx.fillStyle = bg2
      ctx.fill()
      ctx.restore()
    }

    // Two fried eggs, front and centre
    egg(ctx, cx - s * 0.06, cy - s * 0.005, s * 0.088, rng)
    egg(ctx, cx + s * 0.07, cy - s * 0.03, s * 0.082, rng)

    // Hash brown
    ctx.save()
    ctx.translate(cx + s * 0.2, cy - s * 0.1)
    ctx.rotate(-0.18)
    ctx.beginPath()
    ctx.roundRect(-s * 0.075, -s * 0.042, s * 0.15, s * 0.084, s * 0.012)
    const hb = ctx.createLinearGradient(0, -s * 0.042, 0, s * 0.042)
    hb.addColorStop(0, '#e0ab5c')
    hb.addColorStop(1, '#8a561a')
    ctx.fillStyle = hb
    ctx.fill()
    ctx.save()
    ctx.clip()
    for (let i = 0; i < 22; i++) {
      ctx.strokeStyle = a('#5c3609', 0.4)
      ctx.lineWidth = s * 0.004
      ctx.beginPath()
      const y = -s * 0.042 + rng() * s * 0.084
      ctx.moveTo(-s * 0.075, y)
      ctx.lineTo(s * 0.075, y + (rng() - 0.5) * s * 0.01)
      ctx.stroke()
    }
    ctx.restore()
    ctx.restore()

    // Grilled tomato half, cut face up
    ellipse(ctx, cx - s * 0.24, cy - s * 0.09, s * 0.06, s * 0.048)
    const tg = ctx.createRadialGradient(cx - s * 0.25, cy - s * 0.1, 0, cx - s * 0.24, cy - s * 0.09, s * 0.06)
    tg.addColorStop(0, '#e8623a')
    tg.addColorStop(0.6, '#b8331a')
    tg.addColorStop(1, '#6d1c0c')
    ctx.fillStyle = tg
    ctx.fill()

    // Mushrooms
    for (const [dx, dy, k] of [[-0.16, -0.13, 1], [-0.09, -0.16, 0.82]]) {
      ellipse(ctx, cx + s * dx, cy + s * dy, s * 0.045 * k, s * 0.03 * k)
      const mg = ctx.createLinearGradient(0, cy + s * dy - s * 0.03, 0, cy + s * dy + s * 0.03)
      mg.addColorStop(0, '#8a6b4a')
      mg.addColorStop(1, '#3d2b18')
      ctx.fillStyle = mg
      ctx.fill()
    }

    // Toast, leaning on the rim
    for (const [dx, dy, rot] of [[0.02, -0.19, -0.12], [0.13, -0.2, 0.1]]) {
      ctx.save()
      ctx.translate(cx + s * dx, cy + s * dy)
      ctx.rotate(rot)
      ctx.beginPath()
      ctx.roundRect(-s * 0.075, -s * 0.05, s * 0.15, s * 0.1, s * 0.01)
      const tg2 = ctx.createLinearGradient(-s * 0.075, 0, s * 0.075, 0)
      tg2.addColorStop(0, '#e8c98a')
      tg2.addColorStop(1, '#a8781f')
      ctx.fillStyle = tg2
      ctx.fill()
      // The crust edge, so it reads as a slice and not a biscuit
      ctx.strokeStyle = a('#7d5312', 0.75)
      ctx.lineWidth = s * 0.007
      ctx.stroke()
      ctx.restore()
    }

    herbs(ctx, cx, cy - s * 0.05, s * 0.24, rng, 8, '#6f9a4e')
    steam(ctx, cx, cy - s * 0.14, s * 0.18, s * 0.38, rng, 0.55)
  },

  /* Pizza, three ways. Same base, different things on it. */
  ...pizzaVariants(),

  /* Doner, two ways. */
  ...donerVariants(),

  sando(ctx, w, h, rng) {
    const s = S(w, h)
    const cx = w * 0.5
    const cy = h * 0.62
    board(ctx, cx, cy + s * 0.09, s * 0.44, rng)
    // Three pieces, cut faces toward the camera
    const pieces = [
      [-0.19, 0.02, 0.94],
      [0.02, -0.01, 1],
      [0.22, 0.03, 0.92],
    ]
    for (const [dx, dy, k] of pieces) {
      const x = cx + s * dx
      const y = cy + s * dy
      const pw = s * 0.155 * k
      const ph = s * 0.15 * k
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate((rng() - 0.5) * 0.1)
      // Bread block
      ctx.beginPath()
      ctx.roundRect(-pw / 2, -ph / 2, pw, ph, s * 0.012)
      const bg = ctx.createLinearGradient(-pw / 2, 0, pw / 2, 0)
      bg.addColorStop(0, '#f4e6c9')
      bg.addColorStop(0.55, '#e2cfa8')
      bg.addColorStop(1, '#a8905f')
      ctx.fillStyle = bg
      ctx.fill()
      // Crust line at the top
      ctx.beginPath()
      ctx.roundRect(-pw / 2, -ph / 2, pw, ph * 0.09, s * 0.006)
      ctx.fillStyle = '#b1823c'
      ctx.fill()
      // The meat, the thing the whole sandwich is about
      ctx.save()
      ctx.beginPath()
      ctx.rect(-pw / 2, -ph * 0.11, pw, ph * 0.32)
      ctx.clip()
      const mg = ctx.createLinearGradient(0, -ph * 0.11, 0, ph * 0.21)
      mg.addColorStop(0, '#8e3a2c')
      mg.addColorStop(0.5, '#b0503a')
      mg.addColorStop(1, '#6a251b')
      ctx.fillStyle = mg
      ctx.fillRect(-pw / 2, -ph * 0.11, pw, ph * 0.32)
      for (let i = 0; i < 10; i++) {
        ctx.strokeStyle = a('#f0dcc4', 0.35 + rng() * 0.35)
        ctx.lineWidth = s * 0.005
        ctx.beginPath()
        const my = -ph * 0.1 + rng() * ph * 0.3
        ctx.moveTo(-pw / 2, my)
        ctx.bezierCurveTo(-pw * 0.2, my + (rng() - 0.5) * ph * 0.05, pw * 0.2, my + (rng() - 0.5) * ph * 0.05, pw / 2, my)
        ctx.stroke()
      }
      ctx.restore()
      // Mustard
      ctx.fillStyle = '#e0a52c'
      ctx.fillRect(-pw / 2, ph * 0.21, pw, ph * 0.03)
      ctx.restore()
    }
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    pool(ctx, cx - s * 0.12, cy - s * 0.12, s * 0.2, IN.brassLit, 0.24)
    ctx.restore()
  },

  pasta(ctx, w, h, rng) {
    const s = S(w, h)
    const cx = w * 0.5
    const cy = h * 0.63
    plate(ctx, cx, cy, s * 0.42, '#141316')
    // A nest of strands, drawn back to front
    const nest = 46
    for (let i = 0; i < nest; i++) {
      const t = i / nest
      const r0 = s * (0.05 + rng() * 0.15)
      const ang = rng() * TAU
      const px = cx + Math.cos(ang) * r0
      const py = cy - s * 0.03 + Math.sin(ang) * r0 * 0.36
      ctx.beginPath()
      ctx.moveTo(px - s * 0.09, py)
      ctx.bezierCurveTo(
        px - s * 0.03, py - s * 0.05 * (rng() - 0.2),
        px + s * 0.03, py + s * 0.05 * (rng() - 0.2),
        px + s * 0.09, py,
      )
      ctx.strokeStyle = a(mix('#f0d79a', '#8d6a2c', t * 0.7 + rng() * 0.3), 0.9)
      ctx.lineWidth = s * 0.014
      ctx.lineCap = 'round'
      ctx.stroke()
    }
    // Cream pooling under it
    ctx.save()
    ctx.globalAlpha = 0.45
    sauceDrip(ctx, cx, cy + s * 0.03, s * 0.2, rng, '#efe3c8')
    ctx.restore()
    // Truffle, shaved at the pass
    for (let i = 0; i < 7; i++) {
      const th = rng() * TAU
      const rr = Math.sqrt(rng()) * s * 0.17
      ctx.save()
      ctx.translate(cx + Math.cos(th) * rr, cy - s * 0.05 + Math.sin(th) * rr * 0.4)
      ctx.rotate(rng() * TAU)
      ctx.beginPath()
      ctx.ellipse(0, 0, s * 0.035, s * 0.012, 0, 0, TAU)
      ctx.fillStyle = '#2b2119'
      ctx.fill()
      ctx.strokeStyle = a('#8f7a5c', 0.6)
      ctx.lineWidth = s * 0.003
      ctx.stroke()
      ctx.restore()
    }
    crumbs(ctx, cx, cy - s * 0.04, s * 0.2, rng, 22, '#f2ecdc')
    steam(ctx, cx, cy - s * 0.12, s * 0.16, s * 0.46, rng, 0.7)
  },

  milanese(ctx, w, h, rng) {
    const s = S(w, h)
    const cx = w * 0.5
    const cy = h * 0.64
    plate(ctx, cx, cy, s * 0.44)
    ctx.save()
    blob(ctx, cx, cy - s * 0.02, s * 0.29, s * 0.108, rng, 0.1, 13)
    const g = ctx.createLinearGradient(cx - s * 0.28, cy - s * 0.1, cx + s * 0.28, cy + s * 0.08)
    g.addColorStop(0, '#eab96a')
    g.addColorStop(0.4, '#c98e3c')
    g.addColorStop(1, '#7a4f14')
    ctx.fillStyle = g
    ctx.fill()
    ctx.clip()
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = a(rng() > 0.5 ? '#f7d79a' : '#623c0d', 0.2 + rng() * 0.4)
      const px = cx + (rng() - 0.5) * s * 0.58
      const py = cy - s * 0.02 + (rng() - 0.5) * s * 0.21
      ctx.beginPath()
      ctx.ellipse(px, py, s * 0.009 * (0.4 + rng()), s * 0.006 * (0.4 + rng()), rng() * TAU, 0, TAU)
      ctx.fill()
    }
    ctx.restore()
    // Rocket, piled off-centre
    for (let i = 0; i < 16; i++) {
      const x = cx + s * 0.1 + (rng() - 0.5) * s * 0.2
      const y = cy - s * 0.06 + (rng() - 0.5) * s * 0.08
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate((rng() - 0.5) * 2)
      ctx.beginPath()
      ctx.ellipse(0, 0, s * 0.035, s * 0.014, 0, 0, TAU)
      ctx.fillStyle = a(mix('#7ba14f', '#2f4c1d', rng()), 0.95)
      ctx.fill()
      ctx.restore()
    }
    // Parmesan
    for (let i = 0; i < 10; i++) {
      ctx.save()
      ctx.translate(cx + s * 0.09 + (rng() - 0.5) * s * 0.2, cy - s * 0.07 + (rng() - 0.5) * s * 0.07)
      ctx.rotate(rng() * TAU)
      ctx.beginPath()
      ctx.ellipse(0, 0, s * 0.028, s * 0.007, 0, 0, TAU)
      ctx.fillStyle = '#f3e7c8'
      ctx.fill()
      ctx.restore()
    }
    // Lemon
    const lx = cx - s * 0.2
    const ly = cy + s * 0.008
    ellipse(ctx, lx, ly, s * 0.06, s * 0.045)
    ctx.fillStyle = '#e8c944'
    ctx.fill()
    ellipse(ctx, lx, ly, s * 0.05, s * 0.036)
    ctx.fillStyle = '#f6e79a'
    ctx.fill()
    for (let i = 0; i < 8; i++) {
      ctx.save()
      ctx.translate(lx, ly)
      ctx.rotate((i / 8) * TAU)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(s * 0.045, s * 0.006)
      ctx.lineTo(s * 0.045, -s * 0.006)
      ctx.closePath()
      ctx.fillStyle = a('#fff8d8', 0.8)
      ctx.fill()
      ctx.restore()
    }
  },

  cookie(ctx, w, h, rng) {
    const s = S(w, h)
    const cx = w * 0.5
    const cy = h * 0.6
    skillet(ctx, cx, cy, s * 0.34)
    ctx.save()
    ellipse(ctx, cx, cy - s * 0.012, s * 0.278, s * 0.092)
    const g = ctx.createRadialGradient(cx - s * 0.08, cy - s * 0.04, 0, cx, cy, s * 0.3)
    g.addColorStop(0, '#e0ac60')
    g.addColorStop(0.55, '#bd8437')
    g.addColorStop(1, '#7d4f13')
    ctx.fillStyle = g
    ctx.fill()
    ctx.clip()
    // Cracks, with the pistachio centre showing through
    for (let i = 0; i < 7; i++) {
      ctx.beginPath()
      const x0 = cx + (rng() - 0.5) * s * 0.4
      const y0 = cy + (rng() - 0.5) * s * 0.14
      ctx.moveTo(x0, y0)
      ctx.bezierCurveTo(x0 + s * 0.05, y0 - s * 0.02, x0 + s * 0.08, y0 + s * 0.03, x0 + s * 0.14, y0 + s * 0.01)
      ctx.strokeStyle = a('#84a34e', 0.5 + rng() * 0.4)
      ctx.lineWidth = s * 0.012 * (0.5 + rng())
      ctx.stroke()
    }
    ctx.restore()
    // Kunafa, on top, for the noise it makes
    for (let i = 0; i < 60; i++) {
      const th = rng() * TAU
      const rr = Math.sqrt(rng()) * s * 0.2
      const x = cx + Math.cos(th) * rr
      const y = cy - s * 0.03 + Math.sin(th) * rr * 0.34
      ctx.beginPath()
      ctx.moveTo(x - s * 0.03, y)
      ctx.quadraticCurveTo(x, y - s * 0.012 * (rng() - 0.3), x + s * 0.03, y)
      ctx.strokeStyle = a(mix('#f0c377', '#a2661d', rng()), 0.85)
      ctx.lineWidth = s * 0.005
      ctx.stroke()
    }
    crumbs(ctx, cx, cy - s * 0.03, s * 0.2, rng, 34, '#8fb056')
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    pool(ctx, cx - s * 0.06, cy - s * 0.05, s * 0.16, IN.brassLit, 0.3)
    ctx.restore()
    steam(ctx, cx, cy - s * 0.1, s * 0.16, s * 0.4, rng, 0.5)
  },

  basque(ctx, w, h, rng) {
    const s = S(w, h)
    const cx = w * 0.5
    const cy = h * 0.66
    plate(ctx, cx, cy, s * 0.38)
    // A wedge, cut face toward the camera
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(cx - s * 0.16, cy - s * 0.02)
    ctx.lineTo(cx + s * 0.16, cy - s * 0.02)
    ctx.lineTo(cx + s * 0.13, cy - s * 0.19)
    ctx.quadraticCurveTo(cx, cy - s * 0.235, cx - s * 0.13, cy - s * 0.19)
    ctx.closePath()
    const g = ctx.createLinearGradient(0, cy - s * 0.235, 0, cy)
    g.addColorStop(0, '#2a1407')
    g.addColorStop(0.1, '#59300f')
    g.addColorStop(0.26, '#b07a34')
    g.addColorStop(0.52, '#efdcb0')
    g.addColorStop(1, '#c9b07c')
    ctx.fillStyle = g
    ctx.fill()
    ctx.restore()
    // The burnt crown, sitting proud of the cut face
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(cx - s * 0.132, cy - s * 0.188)
    ctx.quadraticCurveTo(cx, cy - s * 0.242, cx + s * 0.132, cy - s * 0.188)
    ctx.quadraticCurveTo(cx, cy - s * 0.168, cx - s * 0.132, cy - s * 0.188)
    ctx.closePath()
    const bgr = ctx.createLinearGradient(cx - s * 0.13, 0, cx + s * 0.13, 0)
    bgr.addColorStop(0, '#40200b')
    bgr.addColorStop(0.4, '#201006')
    bgr.addColorStop(1, '#301806')
    ctx.fillStyle = bgr
    ctx.fill()
    ctx.restore()
    // The cut face is not flat — a wedge has a shadowed right cheek
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(cx + s * 0.08, cy - s * 0.2)
    ctx.lineTo(cx + s * 0.16, cy - s * 0.02)
    ctx.lineTo(cx + s * 0.08, cy - s * 0.02)
    ctx.closePath()
    ctx.fillStyle = a(IN.black, 0.28)
    ctx.fill()
    ctx.restore()
    // Loose centre, running a little
    ctx.save()
    ctx.globalAlpha = 0.6
    sauceDrip(ctx, cx + s * 0.02, cy - s * 0.012, s * 0.1, rng, '#e9cf90')
    ctx.restore()
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    pool(ctx, cx - s * 0.08, cy - s * 0.14, s * 0.12, IN.brassLit, 0.22)
    ctx.restore()
  },

  tiramisu(ctx, w, h, rng) {
    const s = S(w, h)
    const cx = w * 0.5
    const cy = h * 0.58
    const gw = s * 0.26
    const gh = s * 0.42
    contact(ctx, cx, cy + gh / 2 + s * 0.02, gw * 0.9, s * 0.035, 0.8)
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(cx - gw / 2, cy - gh / 2, gw, gh, [gw * 0.06, gw * 0.06, gw * 0.14, gw * 0.14])
    ctx.clip()
    const bands = [
      ['#2e1a0c', 0.0, 0.14],
      ['#efe3c6', 0.14, 0.36],
      ['#3d2513', 0.36, 0.5],
      ['#f3e8ce', 0.5, 0.74],
      ['#5a3a1c', 0.74, 0.86],
      ['#2a1a0e', 0.86, 1.0],
    ]
    for (const [c, t0, t1] of bands) {
      ctx.fillStyle = c
      ctx.fillRect(cx - gw / 2, cy - gh / 2 + gh * t0, gw, gh * (t1 - t0))
    }
    // Cocoa on top
    ctx.fillStyle = '#4a2c17'
    ctx.fillRect(cx - gw / 2, cy - gh / 2, gw, gh * 0.06)
    crumbs(ctx, cx, cy - gh / 2 + gh * 0.03, gw * 0.45, rng, 40, '#6d4522')
    // Wall shading
    const sg = ctx.createLinearGradient(cx - gw / 2, 0, cx + gw / 2, 0)
    sg.addColorStop(0, a(IN.black, 0.42))
    sg.addColorStop(0.28, a(IN.cream, 0.1))
    sg.addColorStop(0.75, a(IN.black, 0.2))
    sg.addColorStop(1, a(IN.black, 0.5))
    ctx.fillStyle = sg
    ctx.fillRect(cx - gw / 2, cy - gh / 2, gw, gh)
    ctx.restore()
    ctx.beginPath()
    ctx.roundRect(cx - gw / 2, cy - gh / 2, gw, gh, [gw * 0.06, gw * 0.06, gw * 0.14, gw * 0.14])
    ctx.strokeStyle = a(IN.cream, 0.42)
    ctx.lineWidth = Math.max(1.4, s * 0.006)
    ctx.stroke()
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    const hg = ctx.createLinearGradient(cx - gw * 0.36, 0, cx - gw * 0.18, 0)
    hg.addColorStop(0, a(IN.cream, 0))
    hg.addColorStop(0.5, a(IN.cream, 0.2))
    hg.addColorStop(1, a(IN.cream, 0))
    ctx.fillStyle = hg
    ctx.fillRect(cx - gw * 0.4, cy - gh * 0.44, gw * 0.3, gh * 0.85)
    ctx.restore()
  },

  pudding(ctx, w, h, rng) {
    const s = S(w, h)
    const cx = w * 0.5
    const cy = h * 0.64
    plate(ctx, cx, cy, s * 0.4)
    ctx.save()
    ctx.globalAlpha = 0.9
    sauceDrip(ctx, cx, cy - s * 0.005, s * 0.24, rng, '#5b3313')
    ctx.restore()
    // The sponge
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(cx - s * 0.13, cy - s * 0.17, s * 0.26, s * 0.16, s * 0.02)
    const g = ctx.createLinearGradient(0, cy - s * 0.17, 0, cy - s * 0.01)
    g.addColorStop(0, '#6b3f1c')
    g.addColorStop(0.4, '#4d2a10')
    g.addColorStop(1, '#2c1707')
    ctx.fillStyle = g
    ctx.fill()
    ctx.restore()
    // Toffee, poured over
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(cx - s * 0.13, cy - s * 0.16)
    ctx.quadraticCurveTo(cx, cy - s * 0.185, cx + s * 0.13, cy - s * 0.16)
    ctx.lineTo(cx + s * 0.13, cy - s * 0.13)
    ctx.quadraticCurveTo(cx + s * 0.05, cy - s * 0.1, cx - s * 0.02, cy - s * 0.13)
    ctx.quadraticCurveTo(cx - s * 0.08, cy - s * 0.09, cx - s * 0.13, cy - s * 0.13)
    ctx.closePath()
    const tg = ctx.createLinearGradient(0, cy - s * 0.19, 0, cy - s * 0.09)
    tg.addColorStop(0, '#c08033')
    tg.addColorStop(1, '#7a4713')
    ctx.fillStyle = tg
    ctx.fill()
    ctx.restore()
    // Ice cream
    ctx.save()
    blob(ctx, cx + s * 0.15, cy - s * 0.08, s * 0.07, s * 0.062, rng, 0.1, 11)
    const ig = ctx.createRadialGradient(cx + s * 0.13, cy - s * 0.1, 0, cx + s * 0.15, cy - s * 0.08, s * 0.08)
    ig.addColorStop(0, '#fdf7e6')
    ig.addColorStop(0.7, '#e6dbc0')
    ig.addColorStop(1, '#a99b7d')
    ctx.fillStyle = ig
    ctx.fill()
    ctx.restore()
    steam(ctx, cx - s * 0.02, cy - s * 0.18, s * 0.12, s * 0.36, rng, 0.5)
  },
}

/* ── the drinks that are not coffee ──────────────────────────────── */

export function citrusGarnish(color) {
  return (ctx, cx, topY, trx, ry) => {
    const r = trx * 0.42
    const x = cx + trx * 0.72
    const y = topY - ry * 0.2
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-0.5)
    ellipse(ctx, 0, 0, r, r * 0.92)
    ctx.fillStyle = color
    ctx.fill()
    ellipse(ctx, 0, 0, r * 0.84, r * 0.76)
    ctx.fillStyle = a(IN.cream, 0.65)
    ctx.fill()
    for (let i = 0; i < 8; i++) {
      ctx.save()
      ctx.rotate((i / 8) * TAU)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(r * 0.78, r * 0.1)
      ctx.lineTo(r * 0.78, -r * 0.1)
      ctx.closePath()
      ctx.fillStyle = a(color, 0.85)
      ctx.fill()
      ctx.restore()
    }
    ctx.restore()
  }
}

export function mintGarnish(ctx, cx, topY, trx, ry) {
  for (let i = 0; i < 5; i++) {
    const ang = -1.9 + i * 0.42
    const x = cx + Math.cos(ang) * trx * 0.5
    const y = topY - ry * 0.5 + Math.sin(ang) * trx * 0.2
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(ang * 0.6)
    ellipse(ctx, 0, 0, trx * 0.24, trx * 0.13)
    ctx.fillStyle = mix('#8fbe5c', '#33562a', i / 5)
    ctx.fill()
    ctx.strokeStyle = a('#22391c', 0.6)
    ctx.lineWidth = trx * 0.012
    ctx.beginPath()
    ctx.moveTo(-trx * 0.22, 0)
    ctx.lineTo(trx * 0.22, 0)
    ctx.stroke()
    ctx.restore()
  }
}

export { plate, skillet, board, bread, egg, herbs, crumbs, blob, lerp, clamp }
