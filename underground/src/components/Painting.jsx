import { useEffect, useRef, useState } from 'react'
import { paint } from '../art/painters.js'

/* ═══════════════════════════════════════════════════════════════════
   PAINTING

   The bridge between a drawing and the layout. A picture is painted
   once, the first time it comes within a screen of the viewport, and
   then again only if the box it lives in changes size by enough to
   matter.

   Two things keep this cheap:

     · Device pixel ratio is capped. A phone reporting DPR 3 gets 2,
       which is the difference between painting 6MP and 13MP for a
       picture nobody will hold a loupe to.

     · Resize is thresholded, not debounced. A 4px reflow when the
       mobile URL bar retracts is not a new picture, and repainting on
       it is the single easiest way to make a scroll stutter.
   ═══════════════════════════════════════════════════════════════════ */

const MAX_DPR = 2

export default function Painting({
  id,
  className = '',
  style,
  ratio,
  eager = false,
  alt = '',
}) {
  const ref = useRef(null)
  const painted = useRef({ w: 0, h: 0 })
  const [near, setNear] = useState(eager)

  // Come within one screen of the viewport before spending anything.
  useEffect(() => {
    if (near) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true)
          io.disconnect()
        }
      },
      { rootMargin: '100% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [near])

  useEffect(() => {
    if (!near) return
    const canvas = ref.current
    if (!canvas) return

    let frame = 0

    const render = () => {
      // `offsetWidth/Height`, never `getBoundingClientRect()`. Several of
      // these canvases sit inside a parallax wrapper that is scaled, and
      // a bounding rect reports the *transformed* box — which would size
      // the backing store to a picture nobody is looking at.
      const cssW = canvas.offsetWidth
      const cssH = canvas.offsetHeight
      if (cssW < 2 || cssH < 2) return

      // Only repaint when the box has actually changed shape.
      const prev = painted.current
      const moved = Math.abs(cssW - prev.w) > 8 || Math.abs(cssH - prev.h) > 8
      if (!moved) return
      painted.current = { w: cssW, h: cssH }

      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      canvas.width = Math.round(cssW * dpr)
      canvas.height = Math.round(cssH * dpr)
      const ctx = canvas.getContext('2d', { alpha: true })
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      paint(ctx, id, cssW, cssH)
      canvas.dataset.painted = '1'
    }

    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(render)
    }

    schedule()
    const ro = new ResizeObserver(schedule)
    ro.observe(canvas)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [near, id])

  return (
    <canvas
      ref={ref}
      className={className}
      role={alt ? 'img' : 'presentation'}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      style={{
        // Absolute against the nearest positioned (or transformed)
        // ancestor rather than a chain of percentage heights, so the
        // element always has one unambiguous size to be painted at.
        // Every caller puts this inside `.frame` or an inset-0 layer.
        //
        // `height: 100%` is not redundant next to `inset: 0`. A canvas
        // is a replaced element, so with `height: auto` the browser
        // takes its *intrinsic* size — the 300×150 default — and drops
        // the `bottom` constraint on the floor. That is worth a line:
        // it silently paints the top 216px of a 377px frame and leaves
        // the rest black, and it looks for all the world like a bug in
        // the drawing.
        position: ratio ? 'relative' : 'absolute',
        inset: ratio ? undefined : 0,
        width: '100%',
        height: ratio ? undefined : '100%',
        aspectRatio: ratio,
        display: 'block',
        ...style,
      }}
    />
  )
}
