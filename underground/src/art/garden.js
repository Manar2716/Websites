/* ═══════════════════════════════════════════════════════════════════
   THE GARDEN

   Five leaves and a few ways of arranging them. Everything green on
   this site — the hero canopy, the section frames, the drifting layer
   behind the type, the footer border — is built from these.

   Each leaf is drawn around its own origin pointing straight up, with
   the stem at (0,0) and the tip at (0,-length), so the caller only has
   to translate and rotate. They all take a `t` (0→1) shade parameter:
   0 is a leaf in full sun, 1 is one deep in the shade behind it. That
   single number is what keeps a mass of foliage reading as depth
   rather than as a flat green shape.

   The veins matter more than they look like they should. A leaf
   silhouette with no midrib reads as a paper cut-out; one line down
   the centre and four pairs off it reads as a plant.
   ═══════════════════════════════════════════════════════════════════ */

import { IN, a, mix, TAU, lerp } from './core.js'

/**
 * The green a leaf is at a given depth, with the sun behind it.
 *
 * The floor here matters. An earlier version ran all the way down to
 * `canopy` (#0c2117), which is very nearly black — and a canopy of
 * near-black leaves against a bright sky is a silhouette, not a garden.
 * The darkest a leaf gets is `frond`, a saturated deep green, and the
 * lightest carries a little lime where the sun is coming through it.
 */
function shade(t, warm = 0) {
  const k = Math.max(0, Math.min(1, t))
  const base = mix(IN.sprout, IN.frond, k)
  return warm > 0 ? mix(base, IN.lime, warm) : base
}

/** Backlight: the glow on a leaf with the sun directly behind it. */
function translucence(ctx, len, wid, t) {
  if (t > 0.55) return
  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  const g = ctx.createRadialGradient(0, -len * 0.55, 0, 0, -len * 0.55, len * 0.7)
  g.addColorStop(0, a(IN.lime, 0.32 * (1 - t)))
  g.addColorStop(1, a(IN.lime, 0))
  ctx.fillStyle = g
  ctx.fillRect(-wid, -len * 1.1, wid * 2, len * 1.2)
  ctx.restore()
}

function midrib(ctx, len, wid, t) {
  ctx.strokeStyle = a(IN.canopy, 0.14 + t * 0.1)
  ctx.lineWidth = Math.max(0.8, len * 0.012)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -len * 0.96)
  ctx.stroke()
  ctx.lineWidth = Math.max(0.6, len * 0.005)
  for (let i = 1; i <= 5; i++) {
    const y = -len * (i / 6)
    const spread = wid * 0.5 * Math.sin((i / 6) * Math.PI)
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.quadraticCurveTo(s * spread * 0.6, y - len * 0.04, s * spread, y - len * 0.1)
      ctx.stroke()
    }
  }
}

/* ── the five leaves ─────────────────────────────────────────────── */

/**
 * Monstera: the split leaf.
 *
 * The notches are traced into the outline, one lobe at a time, rather
 * than cut out afterwards. The first version erased them with
 * `destination-out`, which does not cut a hole in the *leaf* — it cuts
 * a hole in the canvas, straight through every leaf already drawn
 * behind it and out the other side. On a dark page that reads as black
 * spikes radiating out of the foliage, which is exactly what it looked
 * like.
 *
 * Tracing is also simply more correct: a monstera's lobes are separate
 * blades joined at the midrib, and this draws them that way.
 */
export function monstera(ctx, len, t = 0.3, rng = Math.random) {
  const wid = len * 0.9
  const lobes = 5

  ctx.beginPath()
  ctx.moveTo(0, 0)
  // Up the right side, out to each lobe tip and back in toward the rib
  for (let i = 0; i < lobes; i++) {
    const p0 = i / lobes
    const p1 = (i + 0.55) / lobes
    const p2 = (i + 1) / lobes
    const r0 = wid * 0.5 * Math.sin(Math.max(p0, 0.08) * Math.PI) + wid * 0.04
    const r1 = wid * 0.5 * Math.sin(p1 * Math.PI) + wid * 0.05
    ctx.quadraticCurveTo(r1 * 1.15, -len * p1, r1, -len * p1 - len * 0.02)
    ctx.quadraticCurveTo(r0 * 0.22, -len * p2 + len * 0.03, wid * 0.03, -len * p2)
  }
  ctx.lineTo(0, -len)
  // Down the left, mirrored
  for (let i = lobes - 1; i >= 0; i--) {
    const p0 = i / lobes
    const p1 = (i + 0.55) / lobes
    const p2 = (i + 1) / lobes
    const r0 = wid * 0.5 * Math.sin(Math.max(p0, 0.08) * Math.PI) + wid * 0.04
    const r1 = wid * 0.5 * Math.sin(p1 * Math.PI) + wid * 0.05
    ctx.lineTo(-wid * 0.03, -len * p2)
    ctx.quadraticCurveTo(-r0 * 0.22, -len * p2 + len * 0.03, -r1, -len * p1 - len * 0.02)
    ctx.quadraticCurveTo(-r1 * 1.15, -len * p1, -wid * 0.04, -len * p0)
  }
  ctx.closePath()

  const g = ctx.createLinearGradient(-wid * 0.5, 0, wid * 0.5, -len)
  g.addColorStop(0, shade(t + 0.2))
  g.addColorStop(0.45, shade(t))
  g.addColorStop(1, shade(Math.max(0, t - 0.18), 0.16))
  ctx.fillStyle = g
  ctx.fill()

  translucence(ctx, len, wid, t)
  midrib(ctx, len, wid * 0.55, t)
}

/** Banana: a big simple paddle, torn along the edge by tracing. */
export function banana(ctx, len, t = 0.35, rng = Math.random) {
  const wid = len * 0.44
  const steps = 11
  ctx.beginPath()
  ctx.moveTo(0, 0)
  // Right edge, stepping outward with the occasional tear cut back in
  for (let i = 1; i <= steps; i++) {
    const p = i / steps
    const r = wid * Math.sin(Math.min(1, p * 1.05) * Math.PI * 0.86) + wid * 0.08
    const tear = rng() > 0.62 ? r * (0.4 + rng() * 0.3) : r
    ctx.lineTo(tear, -len * p)
    ctx.lineTo(r * 0.98, -len * (p + 0.012))
  }
  ctx.lineTo(0, -len)
  for (let i = steps; i >= 1; i--) {
    const p = i / steps
    const r = wid * Math.sin(Math.min(1, p * 1.05) * Math.PI * 0.86) + wid * 0.08
    const tear = rng() > 0.62 ? r * (0.4 + rng() * 0.3) : r
    ctx.lineTo(-r * 0.98, -len * (p + 0.012))
    ctx.lineTo(-tear, -len * p)
  }
  ctx.closePath()

  const g = ctx.createLinearGradient(-wid, 0, wid, -len)
  g.addColorStop(0, shade(t + 0.22))
  g.addColorStop(0.5, shade(t))
  g.addColorStop(1, shade(Math.max(0, t - 0.16), 0.2))
  ctx.fillStyle = g
  ctx.fill()

  translucence(ctx, len, wid, t)

  ctx.strokeStyle = a(IN.canopy, 0.12 + t * 0.08)
  ctx.lineWidth = Math.max(0.8, len * 0.013)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -len * 0.97)
  ctx.stroke()
  ctx.lineWidth = Math.max(0.5, len * 0.004)
  for (let i = 1; i < 15; i++) {
    const y = -len * (i / 16)
    const spread = wid * 0.92 * Math.sin((i / 16) * Math.PI)
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(s * spread, y - len * 0.055)
      ctx.stroke()
    }
  }
}

/**
 * Palm frond: a spine with blades either side.
 *
 * The blades were thin dark triangles, which read as thorns. They are
 * wider now, overlap their neighbours, and their shade is pulled toward
 * the light rather than away from it — a palm frond is one of the
 * brightest things in a garden, not one of the darkest.
 */
export function palm(ctx, len, t = 0.3, rng = Math.random) {
  const blades = 11
  const wid = len * 0.44
  for (let i = 1; i <= blades; i++) {
    const p = i / blades
    const y = -len * p
    const spread = wid * Math.sin(p * Math.PI) * (0.8 + p * 0.5)
    const droop = len * 0.08 * p
    const thick = len * 0.1 * Math.sin(p * Math.PI) + len * 0.02
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.moveTo(0, y + thick * 0.4)
      ctx.quadraticCurveTo(s * spread * 0.55, y - len * 0.015, s * spread, y + droop)
      ctx.quadraticCurveTo(s * spread * 0.5, y + thick * 0.9, 0, y + thick)
      ctx.closePath()
      ctx.fillStyle = shade(Math.max(0, t + (s < 0 ? 0.12 : -0.06)) , s > 0 ? 0.1 : 0)
      ctx.fill()
    }
  }
  ctx.strokeStyle = a(IN.canopy, 0.22)
  ctx.lineWidth = Math.max(1, len * 0.01)
  ctx.beginPath()
  ctx.moveTo(0, len * 0.03)
  ctx.lineTo(0, -len)
  ctx.stroke()
}

/** Philodendron: a plain heart, the quiet one that fills gaps. */
export function heart(ctx, len, t = 0.4) {
  const wid = len * 0.78
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(-wid * 0.62, -len * 0.06, -wid * 0.6, -len * 0.72, 0, -len)
  ctx.bezierCurveTo(wid * 0.6, -len * 0.72, wid * 0.62, -len * 0.06, 0, 0)
  ctx.closePath()
  const g = ctx.createLinearGradient(-wid * 0.5, 0, wid * 0.4, -len)
  g.addColorStop(0, shade(t + 0.18))
  g.addColorStop(1, shade(Math.max(0, t - 0.12), 0.14))
  ctx.fillStyle = g
  ctx.fill()
  translucence(ctx, len, wid, t)
  midrib(ctx, len, wid * 0.72, t)
}

/** Fern: a frond of little paired leaflets, for edges and undergrowth. */
export function fern(ctx, len, t = 0.45) {
  const n = 15
  ctx.strokeStyle = a(IN.frond, 0.4)
  ctx.lineWidth = Math.max(0.8, len * 0.008)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.quadraticCurveTo(len * 0.08, -len * 0.5, 0, -len)
  ctx.stroke()
  for (let i = 1; i <= n; i++) {
    const p = i / n
    const y = -len * p
    const x = Math.sin(p * Math.PI) * len * 0.06
    const l = len * 0.22 * Math.sin(p * Math.PI) * (1.1 - p * 0.35)
    for (const s of [-1, 1]) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(s * (0.95 - p * 0.3))
      ctx.beginPath()
      ctx.ellipse(0, -l * 0.5, l * 0.26, l * 0.5, 0, 0, TAU)
      ctx.fillStyle = shade(t + p * 0.08 + (s < 0 ? 0.06 : -0.04))
      ctx.fill()
      ctx.restore()
    }
  }
}

export const LEAVES = { monstera, banana, palm, heart, fern }
const KINDS = Object.keys(LEAVES)

/* ── arrangements ────────────────────────────────────────────────── */

/**
 * A mass of foliage along an edge.
 *
 * `side` is where it grows from, and the leaves fan *inward* off that
 * edge with their stems just outside the frame — which is how a plant
 * at the edge of a photograph actually behaves. Depth is faked by
 * drawing back-to-front and darkening with distance.
 */
export function border(ctx, w, h, rng, o = {}) {
  const { side = 'top', count = 6, scale = 1, depth = 0.55, kinds = KINDS } = o

  for (let i = 0; i < count; i++) {
    const back = 1 - i / count // 1 at the back, 0 at the front
    const t = depth * back + 0.08
    const len = Math.min(w, h) * (0.22 + rng() * 0.26) * scale * lerp(0.8, 1.12, 1 - back)

    let x
    let y
    let rot
    const along = rng()
    if (side === 'top') {
      x = along * w
      y = -h * 0.13
      rot = Math.PI + (along - 0.5) * 1.5 + (rng() - 0.5) * 0.5
    } else if (side === 'bottom') {
      x = along * w
      y = h * 1.06
      rot = (along - 0.5) * 1.5 + (rng() - 0.5) * 0.5
    } else if (side === 'left') {
      x = -w * 0.11
      y = along * h
      rot = Math.PI * 0.5 + (along - 0.5) * 1.2 + (rng() - 0.5) * 0.5
    } else {
      x = w * 1.11
      y = along * h
      rot = -Math.PI * 0.5 + (along - 0.5) * 1.2 + (rng() - 0.5) * 0.5
    }

    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    const kind = kinds[Math.floor(rng() * kinds.length)]
    LEAVES[kind](ctx, len, t, rng)
    ctx.restore()
  }
}

/**
 * A planted cluster standing on the ground at (x, y) — a pot's worth of
 * leaves fanning up and out from one point.
 */
export function cluster(ctx, x, y, size, rng, o = {}) {
  const { count = 7, t = 0.3, spread = 1.1, kinds = ['monstera', 'heart', 'palm'] } = o
  for (let i = 0; i < count; i++) {
    const p = i / Math.max(1, count - 1)
    const ang = lerp(-spread, spread, p) + (rng() - 0.5) * 0.25
    ctx.save()
    ctx.translate(x + (rng() - 0.5) * size * 0.1, y)
    ctx.rotate(ang)
    const kind = kinds[Math.floor(rng() * kinds.length)]
    LEAVES[kind](ctx, size * (0.7 + rng() * 0.55), t + Math.abs(ang) * 0.14, rng)
    ctx.restore()
  }
}

/** A terracotta pot, for the clusters that need somewhere to be. */
export function pot(ctx, x, y, w, h) {
  ctx.beginPath()
  ctx.moveTo(x - w / 2, y - h)
  ctx.lineTo(x + w / 2, y - h)
  ctx.lineTo(x + w * 0.36, y)
  ctx.lineTo(x - w * 0.36, y)
  ctx.closePath()
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0)
  g.addColorStop(0, '#8a5433')
  g.addColorStop(0.3, '#c07f4e')
  g.addColorStop(1, '#6d3f24')
  ctx.fillStyle = g
  ctx.fill()
  ctx.beginPath()
  ctx.roundRect(x - w * 0.56, y - h - h * 0.16, w * 1.12, h * 0.2, h * 0.05)
  ctx.fillStyle = '#a8683d'
  ctx.fill()
}

/** Woven rattan — the chairs and the lampshades on a terrace. */
export function rattan(ctx, x, y, w, h, rng) {
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x - w / 2, y - h, w, h, [w * 0.4, w * 0.4, w * 0.1, w * 0.1])
  ctx.fillStyle = '#c9a068'
  ctx.fill()
  ctx.clip()
  ctx.strokeStyle = a('#7d5626', 0.5)
  ctx.lineWidth = Math.max(1, h * 0.014)
  for (let i = -8; i < 16; i++) {
    ctx.beginPath()
    ctx.moveTo(x - w, y - h + i * h * 0.09)
    ctx.lineTo(x + w, y - h + i * h * 0.09 + w * 0.5)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x - w, y - h + i * h * 0.09 + w * 0.5)
    ctx.lineTo(x + w, y - h + i * h * 0.09)
    ctx.stroke()
  }
  ctx.restore()
}
