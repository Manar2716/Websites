/* ═══════════════════════════════════════════════════════════════════
   THE CAMERA — moved outdoors.

   Every picture on this page is drawn here at run time onto a 2D
   canvas. No photograph, no image file, no CDN.

   The previous version of this file lit a basement: one warm lamp,
   shadows crushed to near-black, a heavy vignette on everything. That
   is exactly the wrong instrument for a garden. Sunlight through
   leaves is not one lamp — it is a huge soft source overhead, a green
   bounce coming back up off the foliage, and hard little coins of
   light where the canopy has gaps. Nothing goes black outdoors at
   midday; the deepest shade here is a saturated green, not an absence.

     key       the sun, high and slightly right, large and soft
     bounce    green, from below and behind — the leaves feed light back
     rim       warm gold on the top edge of every form
     shade     deep green, never grey, never black
     dapple    the signature: hard-edged coins of sun with soft falloff

   All randomness is seeded off the picture's own id, so a resize
   redraws the same picture rather than a new one.
   ═══════════════════════════════════════════════════════════════════ */

export const IN = {
  // Greens, dark to light
  canopy: '#0c2117',
  frond: '#14392a',
  leaf: '#2f6b45',
  sprout: '#5c9b5e',
  lime: '#9dc44b',
  // Warm neutrals
  ink: '#10241a',
  bark: '#4a3120',
  teak: '#7a4f2a',
  sand: '#e7dcc6',
  cream: '#f6f1e4',
  white: '#fffdf6',
  // Light
  sun: '#ffe9a8',
  sunHot: '#fff8dc',
  gold: '#c79a3e',
  // The only cool value in the set, for glass and steel
  slate: '#8ba59a',

  /* Food keeps its own colours. A burger is not greener outdoors, and
     tinting the dishes toward the palette is how a set of food pictures
     stops looking like food. These are the values the plates and cups
     are built from, unchanged by the move into daylight — only the
     light falling on them changed. */
  coffee: '#2a1408',
  crema: '#b07b3f',
  cremaLit: '#d9a765',
  milk: '#f7f0dd',
  ember: '#c2452d',

  /* Two aliases kept so the dish code reads naturally. `black` is only
     ever used for the *inside* of things — a pan, a cup's shadow — and
     never for a shadow cast on the ground, which outdoors is green. */
  black: '#211a12',
  brassLit: '#ffe9a8',
  cool: '#8ba59a',
}

/* ── numbers ─────────────────────────────────────────────────────── */

export const lerp = (a, b, t) => a + (b - a) * t
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
export const TAU = Math.PI * 2

/** Deterministic PRNG. Same id in, same picture out, every time. */
export function rngFrom(id) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return function next() {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** `#rrggbb` + alpha → `rgba()`. Passes an existing rgba string through. */
export function a(hex, alpha) {
  if (hex[0] !== '#') return hex
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** Mix two hex colours in plain sRGB. Good enough inside one hue family. */
export function mix(c1, c2, t) {
  const p = (c) => {
    const n = parseInt(c.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const [r1, g1, b1] = p(c1)
  const [r2, g2, b2] = p(c2)
  return `rgb(${Math.round(lerp(r1, r2, t))},${Math.round(lerp(g1, g2, t))},${Math.round(lerp(b1, b2, t))})`
}

/**
 * Compose in a fixed virtual frame, then cover the real one.
 *
 * The same drawing is asked for at 16:10 in the gallery, 4:5 in a menu
 * card and 9:19 behind the hero on a phone. Composing against the real
 * width and height gives a picture that works in one of those and
 * falls apart in the rest.
 */
export function cover(ctx, w, h, vw, vh, anchorY = 0.5) {
  const s = Math.max(w / vw, h / vh)
  ctx.translate((w - vw * s) * 0.5, (h - vh * s) * anchorY)
  ctx.scale(s, s)
  return s
}

/* ── shapes ──────────────────────────────────────────────────────── */

export function ellipse(ctx, cx, cy, rx, ry, rot = 0) {
  ctx.beginPath()
  ctx.ellipse(cx, cy, Math.max(rx, 0.1), Math.max(ry, 0.1), rot, 0, TAU)
}

/** A closed blob with `n` lobes of wobble — bread, a mass of sauce, a stone. */
export function blob(ctx, cx, cy, rx, ry, rng, wob = 0.09, n = 9) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const th = (i / n) * TAU
    const k = 1 + (rng() - 0.5) * 2 * wob
    pts.push([cx + Math.cos(th) * rx * k, cy + Math.sin(th) * ry * k])
  }
  ctx.beginPath()
  for (let i = 0; i <= pts.length; i++) {
    const p0 = pts[(i - 1 + pts.length) % pts.length]
    const p1 = pts[i % pts.length]
    const m = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
    if (i === 0) ctx.moveTo(m[0], m[1])
    else ctx.quadraticCurveTo(p0[0], p0[1], m[0], m[1])
  }
  ctx.closePath()
}

/* ── light ───────────────────────────────────────────────────────── */

/** A soft pool of light. The workhorse: nothing here is lit flat. */
export function pool(ctx, cx, cy, r, color, alpha, inner = 0) {
  const g = ctx.createRadialGradient(cx, cy, r * inner, cx, cy, r)
  g.addColorStop(0, a(color, alpha))
  g.addColorStop(0.55, a(color, alpha * 0.34))
  g.addColorStop(1, a(color, 0))
  ctx.fillStyle = g
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
}

/**
 * Contact shadow, outdoors.
 *
 * Indoors this was near-black. In a garden the shadow under a plate is
 * the colour of the light bouncing into it, which is green — so it is
 * mixed green here and kept much lighter. A grey shadow on a cream
 * table is the single fastest way to make a daylight scene look like a
 * cut-out.
 */
export function contact(ctx, cx, cy, rx, ry, strength = 0.3) {
  ctx.save()
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry))
  g.addColorStop(0, a(IN.frond, strength))
  g.addColorStop(0.45, a(IN.frond, strength * 0.42))
  g.addColorStop(1, a(IN.frond, 0))
  ctx.fillStyle = g
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(1, ry / Math.max(rx, 0.001))
  ellipse(ctx, 0, 0, rx, rx)
  ctx.restore()
  ctx.fillRect(cx - rx * 1.2, cy - ry * 1.4, rx * 2.4, ry * 2.8)
  ctx.restore()
}

/**
 * Dapple — coins of sunlight through a canopy.
 *
 * This is the one effect that says "under a tree" more than any amount
 * of green. Each coin is a soft-edged ellipse of warm light, slightly
 * elongated along the light's direction, clustered rather than evenly
 * scattered, because leaves grow in clumps and so do their gaps.
 */
export function dapple(ctx, w, h, rng, o = {}) {
  const { count = 14, scale = 1, alpha = 0.5, tint = IN.sun } = o
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  let cx = rng() * w
  let cy = rng() * h
  for (let i = 0; i < count; i++) {
    // Walk in clumps rather than sampling uniformly
    if (i % 4 === 0) {
      cx = rng() * w
      cy = rng() * h * 0.9
    }
    const x = cx + (rng() - 0.5) * w * 0.28
    const y = cy + (rng() - 0.5) * h * 0.22
    const r = Math.min(w, h) * (0.04 + rng() * 0.1) * scale
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(-0.5 + rng() * 0.4)
    ctx.scale(1, 0.62)
    pool(ctx, 0, 0, r, tint, alpha * (0.35 + rng() * 0.65))
    ctx.restore()
  }
  ctx.restore()
}

/* ── the frame ───────────────────────────────────────────────────── */

/**
 * The ground a still life stands on: a pale stone or wood surface in
 * open shade, with the canopy above it throwing dapple across the back.
 */
export function stage(ctx, w, h, rng, o = {}) {
  const { horizon = 0.66, surface = 'stone', dapples = 10 } = o

  // Air behind the subject — green, going lighter toward the light
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h)
  g.addColorStop(0, '#dbe7cf')
  g.addColorStop(0.45, '#c2d6b4')
  g.addColorStop(1, '#9dbb96')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // Out-of-focus foliage massing behind. These were round blobs, which
  // at this softness read as soap bubbles rather than plants — a leaf
  // silhouette survives being thrown out of focus, a circle does not.
  for (let i = 0; i < 8; i++) {
    const bx = rng() * w
    const by = h * (0.02 + rng() * 0.5)
    const br = Math.min(w, h) * (0.22 + rng() * 0.36)
    ctx.save()
    ctx.globalAlpha = 0.14 + rng() * 0.16
    ctx.translate(bx, by)
    ctx.rotate(rng() * TAU)
    ctx.fillStyle = mix(IN.leaf, IN.frond, rng())
    // A long lobed paddle, which is what most leaves reduce to when soft
    ctx.beginPath()
    ctx.moveTo(0, 0)
    const lobes = 3 + Math.floor(rng() * 3)
    for (let k = 0; k <= lobes; k++) {
      const t = k / lobes
      const wgt = br * 0.42 * Math.sin(Math.max(t, 0.1) * Math.PI)
      ctx.quadraticCurveTo(wgt * 1.3, -br * (t + 0.5 / lobes), wgt * 0.2, -br * (t + 1 / lobes))
    }
    for (let k = lobes; k >= 0; k--) {
      const t = k / lobes
      const wgt = br * 0.42 * Math.sin(Math.max(t, 0.1) * Math.PI)
      ctx.quadraticCurveTo(-wgt * 1.3, -br * (t + 0.5 / lobes), -wgt * 0.2, -br * t)
    }
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  pool(ctx, w * 0.72, h * 0.12, Math.max(w, h) * 0.7, IN.sun, 0.4)

  // The surface
  const y = h * horizon
  const t = ctx.createLinearGradient(0, y - h * 0.05, 0, h)
  if (surface === 'wood') {
    t.addColorStop(0, '#c39257')
    t.addColorStop(0.35, '#a9773f')
    t.addColorStop(1, '#84592a')
  } else {
    t.addColorStop(0, '#f2ece0')
    t.addColorStop(0.4, '#e4dcc9')
    t.addColorStop(1, '#cdc3ac')
  }
  ctx.fillStyle = t
  ctx.fillRect(0, y, w, h - y)

  // Grain in the surface
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, y, w, h - y)
  ctx.clip()
  for (let i = 0; i < 44; i++) {
    ctx.strokeStyle = a(surface === 'wood' ? '#6b4620' : '#b8ad95', 0.06 + rng() * 0.14)
    ctx.lineWidth = Math.max(1, h * 0.003)
    const ly = y + rng() * (h - y)
    ctx.beginPath()
    ctx.moveTo(0, ly)
    ctx.bezierCurveTo(w * 0.3, ly + (rng() - 0.5) * h * 0.02, w * 0.7, ly + (rng() - 0.5) * h * 0.02, w, ly)
    ctx.stroke()
  }
  ctx.restore()

  // The line where the surface meets the air
  ctx.fillStyle = a(IN.frond, 0.16)
  ctx.fillRect(0, y, w, Math.max(1.2, h * 0.004))

  dapple(ctx, w, h, rng, { count: dapples, alpha: 0.42 })
}

/** Steam. Warm and thin — outdoors it is lit from behind by the sun. */
export function steam(ctx, x, y, w, h, rng, strength = 1) {
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  const n = 36
  let drift = 0
  for (let i = 0; i < n; i++) {
    const t = i / n
    drift += (rng() - 0.5) * w * 0.11
    drift *= 0.84
    const px = x + drift + Math.sin(t * 4.6) * w * 0.22 * t
    const py = y - t * h
    const r = w * (0.2 + t * 0.55) * (0.7 + rng() * 0.5)
    const al = (1 - t) * (1 - t) * 0.06 * strength * (0.5 + rng() * 0.8)
    pool(ctx, px, py, r, IN.sunHot, al)
  }
  ctx.restore()
}

/* ── post ────────────────────────────────────────────────────────── */

/**
 * The last pass: a warm sun grade, a *lifted* corner falloff rather
 * than a vignette, and a little grain.
 *
 * A dark vignette is what made the old set feel like a basement. Here
 * the corners get slightly more green instead of more black, which
 * reads as foliage crowding the edge of the frame.
 */
export function post(ctx, w, h, rng, o = {}) {
  const { edge = 0.5, grain = 0.035, warmth = 0.08 } = o

  if (warmth > 0) {
    ctx.save()
    ctx.globalCompositeOperation = 'overlay'
    const g = ctx.createLinearGradient(w, 0, 0, h)
    g.addColorStop(0, a(IN.sun, warmth))
    g.addColorStop(1, a(IN.leaf, warmth * 0.8))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }

  if (edge > 0) {
    const r = Math.hypot(w, h) * 0.62
    const v = ctx.createRadialGradient(w * 0.5, h * 0.46, r * 0.42, w * 0.5, h * 0.5, r)
    v.addColorStop(0, 'rgba(0,0,0,0)')
    v.addColorStop(1, a(IN.frond, 0.3 * edge))
    ctx.fillStyle = v
    ctx.fillRect(0, 0, w, h)
  }

  // Sparse dots rather than a full ImageData pass, which is milliseconds
  // we do not need to spend on a 3% effect.
  if (grain > 0) {
    ctx.save()
    const count = Math.round((w * h) / 1100)
    for (let i = 0; i < count; i++) {
      const gx = rng() * w
      const gy = rng() * h
      ctx.fillStyle = rng() > 0.5 ? a(IN.white, grain * rng()) : a(IN.frond, grain * rng())
      ctx.fillRect(gx, gy, 1.2, 1.2)
    }
    ctx.restore()
  }
}
