/* ═══════════════════════════════════════════════════════════════════
   THE CAMERA

   There is no photograph in this project. Every picture on the page —
   the room, the machine, the plates, the cups — is drawn here at run
   time onto a 2D canvas.

   That is a constraint with a reason behind it. A site for a business
   cannot show photographs of a room it has not been inside, and stock
   images of somebody else's cafe are worse than none: they are a claim.
   Drawing the room instead says exactly what it is, stays sharp on a
   4K panel, weighs nothing, and can be re-lit by changing one number.

   Everything is lit the same way, and that is what makes the set read
   as one body of work rather than a folder of unrelated pictures:

     key      warm, upper left, hard-ish, the brass side of white
     fill     almost nothing — the shadows go to near-black
     rim      a cool bounce on the right edge of every form, so objects
              separate from the ground without being lifted out of it
     ground   never flat: a pool of warm light with the corners falling
              away, and grain over the whole frame

   All randomness is seeded off the picture's own id, so a resize
   redraws the same picture rather than a new one.
   ═══════════════════════════════════════════════════════════════════ */

export const IN = {
  black: '#070708',
  ground: '#0a0a0b',
  basalt: '#121114',
  ash: '#1d1b1e',
  concrete: '#2a2724',
  cream: '#ede7dc',
  bone: '#c6beb1',
  brass: '#c39a62',
  brassLit: '#e8cfa4',
  brassDim: '#7d6340',
  ember: '#c2452d',
  coffee: '#2a1408',
  crema: '#b07b3f',
  cremaLit: '#d9a765',
  milk: '#f2ead9',
  cool: '#8fa3ad',
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

/** `#rrggbb` + alpha → `rgba()`. Accepts an already-rgba string untouched. */
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
 * The same drawing is asked for at 16:10 in the gallery, 4:5 in the
 * ritual rail and 9:19 behind the hero on a phone. Composing against
 * `w` and `h` directly means a picture that works in one of those and
 * falls apart in the others — the bar ends up off the bottom, or the
 * pendant lands on the headline.
 *
 * So every interior is composed once inside a virtual box and scaled
 * to *cover* the canvas, exactly the way `object-fit: cover` treats a
 * photograph. `anchorY` decides what gets cropped when the shapes
 * disagree: rooms hold their floor line, so they anchor low.
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

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** A closed blob with `n` lobes of wobble — bread, meat, a spill of sauce. */
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

/** A soft pool of light. The workhorse: nothing on this page is lit flat. */
export function pool(ctx, cx, cy, r, color, alpha, inner = 0) {
  const g = ctx.createRadialGradient(cx, cy, r * inner, cx, cy, r)
  g.addColorStop(0, a(color, alpha))
  g.addColorStop(0.55, a(color, alpha * 0.34))
  g.addColorStop(1, a(color, 0))
  ctx.fillStyle = g
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2)
}

/** Contact shadow. Objects that do not touch the table look pasted on. */
export function contact(ctx, cx, cy, rx, ry, strength = 0.72) {
  ctx.save()
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry))
  g.addColorStop(0, a(IN.black, strength))
  g.addColorStop(0.5, a(IN.black, strength * 0.45))
  g.addColorStop(1, a(IN.black, 0))
  ctx.fillStyle = g
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(1, ry / Math.max(rx, 0.001))
  ellipse(ctx, 0, 0, rx, rx)
  ctx.restore()
  ctx.fillRect(cx - rx * 1.2, cy - ry * 1.4, rx * 2.4, ry * 2.8)
  ctx.restore()
}

/* ── the frame ───────────────────────────────────────────────────── */

/**
 * The ground every still life stands on: a dark room, one warm pool
 * behind the subject, a table that catches the bottom third, and a few
 * out-of-focus lights at the back so the space has depth behind it.
 */
export function stage(ctx, w, h, rng, o = {}) {
  const {
    horizon = 0.62,
    warm = IN.brass,
    keyX = 0.36,
    keyY = 0.3,
    bokeh = 5,
    table = true,
  } = o

  // Room
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#141215')
  g.addColorStop(0.55, '#0d0c0e')
  g.addColorStop(1, '#08080a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  pool(ctx, w * keyX, h * keyY, Math.max(w, h) * 0.68, warm, 0.16)
  pool(ctx, w * 0.9, h * 0.16, w * 0.42, IN.cool, 0.05)

  // Out-of-focus lights at the back of the room
  for (let i = 0; i < bokeh; i++) {
    const bx = rng() * w
    const by = h * (0.08 + rng() * 0.34)
    const br = w * (0.018 + rng() * 0.05)
    pool(ctx, bx, by, br * 3.2, rng() > 0.7 ? IN.cream : IN.brassLit, 0.05 + rng() * 0.07)
  }

  if (table) {
    const y = h * horizon
    const t = ctx.createLinearGradient(0, y - h * 0.06, 0, h)
    t.addColorStop(0, a('#100e0f', 0))
    t.addColorStop(0.18, a('#1a1614', 0.85))
    t.addColorStop(1, a('#0b0a0b', 1))
    ctx.fillStyle = t
    ctx.fillRect(0, y - h * 0.08, w, h - y + h * 0.08)

    // A sheen running across the surface, so it reads as stone not paper
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    const s = ctx.createLinearGradient(0, y, w, h)
    s.addColorStop(0, a(warm, 0))
    s.addColorStop(0.4, a(warm, 0.07))
    s.addColorStop(1, a(warm, 0))
    ctx.fillStyle = s
    ctx.fillRect(0, y - h * 0.04, w, h)
    ctx.restore()
  }
}

/**
 * Steam. Forty soft dabs along a wandering path — never a stroked line.
 *
 * Two things were wrong with the first version and both are worth
 * naming. It was drawn in neutral cream, which over a warm plate reads
 * as cigarette smoke rather than as water; it is warm now, borrowing
 * the colour of whatever lamp is lighting the scene. And it rose in a
 * straight column at full strength the whole way up — real steam is
 * strongest just off the surface and has fallen apart by the time it
 * is a cup's height above it, so the falloff is now squared.
 */
export function steam(ctx, x, y, w, h, rng, strength = 1) {
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  const n = 40
  let drift = 0
  for (let i = 0; i < n; i++) {
    const t = i / n
    drift += (rng() - 0.5) * w * 0.11
    drift *= 0.84
    const px = x + drift + Math.sin(t * 4.6) * w * 0.22 * t
    const py = y - t * h
    const r = w * (0.2 + t * 0.55) * (0.7 + rng() * 0.5)
    const al = (1 - t) * (1 - t) * 0.05 * strength * (0.5 + rng() * 0.8)
    pool(ctx, px, py, r, t > 0.4 ? IN.cream : IN.brassLit, al)
  }
  ctx.restore()
}

/* ── post ────────────────────────────────────────────────────────── */

/** Vignette + grain + a warm/cool split. The last thing every picture gets. */
export function post(ctx, w, h, rng, o = {}) {
  const { vignette = 0.9, grain = 0.05, warmth = 0.05 } = o

  if (warmth > 0) {
    ctx.save()
    ctx.globalCompositeOperation = 'overlay'
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, a(IN.brass, warmth))
    g.addColorStop(1, a(IN.cool, warmth * 0.7))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }

  const r = Math.hypot(w, h) * 0.62
  const v = ctx.createRadialGradient(w * 0.5, h * 0.46, r * 0.32, w * 0.5, h * 0.5, r)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(0.68, a(IN.black, 0.28 * vignette))
  v.addColorStop(1, a(IN.black, 0.86 * vignette))
  ctx.fillStyle = v
  ctx.fillRect(0, 0, w, h)

  // Grain, drawn as sparse dots rather than per-pixel image data — a
  // full ImageData pass over a 1600px canvas is milliseconds we do not
  // need to spend for an effect that is 5% opacity.
  if (grain > 0) {
    ctx.save()
    const count = Math.round((w * h) / 900)
    for (let i = 0; i < count; i++) {
      const gx = rng() * w
      const gy = rng() * h
      const l = rng()
      ctx.fillStyle = l > 0.5 ? a(IN.cream, grain * rng()) : a(IN.black, grain * 1.6 * rng())
      ctx.fillRect(gx, gy, 1.2, 1.2)
    }
    ctx.restore()
  }
}
