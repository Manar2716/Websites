import { useEffect, useRef } from 'react'
import { LEAVES } from '../art/garden.js'
import { rngFrom } from '../art/core.js'

/* ═══════════════════════════════════════════════════════════════════
   DRIFT — the layer of leaves moving behind everything.

   A fixed canvas with a couple of dozen leaves on it, swaying on their
   stems and sinking slowly down the viewport. It is the one continuously
   animating thing on the page, so it is also the one thing most able to
   ruin the scroll, and it is built around that:

     · Leaves are pre-rendered once into small offscreen canvases, one
       per kind and size. Per frame the loop only does `drawImage` with
       a rotation — no path building, no gradients, no `fill()`.
     · The whole thing runs at 30fps, not 60. Foliage moving in a light
       breeze has no high-frequency detail to lose, and halving the rate
       halves the cost of the only always-on animation here.
     · It pauses when the tab is hidden, and never starts at all under
       `prefers-reduced-motion` or on a coarse pointer, where the budget
       is better spent on the pictures.
   ═══════════════════════════════════════════════════════════════════ */

const KINDS = ['monstera', 'heart', 'fern', 'palm']

export default function Drift({ reduced }) {
  const ref = useRef(null)

  useEffect(() => {
    if (reduced) return
    // Phones have the least headroom and the most to lose from a
    // dropped frame; the page reads the same without this layer.
    if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return

    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const rng = rngFrom('drift')
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0
    let h = 0

    // One sprite per leaf kind, rendered once at a generous size
    const sprites = KINDS.map((kind) => {
      const size = 190
      const c = document.createElement('canvas')
      c.width = c.height = size * dpr
      const cx = c.getContext('2d')
      cx.scale(dpr, dpr)
      cx.translate(size / 2, size * 0.92)
      // Drawn dark: multiplied over cream, a light leaf turns grey and
      // reads as a smudge, where a saturated one reads as a soft shadow.
      LEAVES[kind](cx, size * 0.8, 0.72 + rng() * 0.2, rng)
      return c
    })

    const leaves = Array.from({ length: 12 }, () => ({
      sprite: sprites[Math.floor(rng() * sprites.length)],
      x: rng(),
      y: rng(),
      scale: 0.12 + rng() * 0.22,
      rot: rng() * Math.PI * 2,
      sway: 0.3 + rng() * 0.7,
      phase: rng() * Math.PI * 2,
      fall: 0.006 + rng() * 0.014,
      alpha: 0.045 + rng() * 0.075,
    }))

    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()

    let raf = 0
    let last = 0
    let running = true
    const FRAME = 1000 / 30

    const tick = (now) => {
      raf = requestAnimationFrame(tick)
      if (!running || now - last < FRAME) return
      const dt = Math.min(64, now - last)
      last = now

      ctx.clearRect(0, 0, w, h)
      for (const l of leaves) {
        l.phase += dt * 0.0004 * l.sway
        l.y += (dt / 1000) * l.fall
        if (l.y > 1.25) {
          l.y = -0.25
          l.x = rng()
        }
        const s = l.sprite
        const size = 190 * l.scale
        ctx.save()
        ctx.globalAlpha = l.alpha
        ctx.translate(l.x * w + Math.sin(l.phase) * 26, l.y * h)
        ctx.rotate(l.rot + Math.sin(l.phase * 0.8) * 0.22)
        ctx.drawImage(s, -size / 2, -size * 0.92, size, size)
        ctx.restore()
      }
    }
    raf = requestAnimationFrame(tick)

    const onVis = () => {
      running = !document.hidden
      last = performance.now()
    }
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [reduced])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[2]"
      style={{ mixBlendMode: 'multiply' }}
    />
  )
}
