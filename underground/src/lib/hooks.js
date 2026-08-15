import { useEffect, useRef, useState, useCallback } from 'react'

/* ═══════════════════════════════════════════════════════════════════
   THE MOTION KIT

   Four hooks, and between them they drive every piece of movement on
   the page. The rules they all follow:

     · Nothing reads layout inside a frame. Handlers park a number;
       work happens once, on the next animation frame.
     · Everything animated is `transform` or `opacity`. Nothing else
       composites for free.
     · Reduced motion is not a downgrade path bolted on afterwards —
       each hook checks it first and returns a still version of itself.
   ═══════════════════════════════════════════════════════════════════ */

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/* ── reveals ─────────────────────────────────────────────────────── */

/**
 * Adds `.is-in` to everything carrying `[data-reveal]`, `.mask-reveal`
 * or `[data-reveal-group]` once it enters the viewport.
 *
 * An IntersectionObserver on its own is not enough on a page with a
 * nav. It fires on a *threshold crossing*, and clicking "Location"
 * takes every section in between from "below the fold, not
 * intersecting" to "above the fold, not intersecting" without ever
 * crossing one. No entry is delivered and those sections sit at
 * opacity 0 forever. So: the observer handles ordinary scrolling, and
 * a sweep handles jumps — when the scroll position moves more than
 * three quarters of a viewport between frames, anything at or above
 * the fold is measured once and let in.
 */
export function useReveals(reduced) {
  useEffect(() => {
    const sel = '[data-reveal], .mask-reveal, [data-reveal-group]'
    const nodes = () => Array.from(document.querySelectorAll(sel))

    if (reduced) {
      nodes().forEach((n) => n.classList.add('is-in'))
      return
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in')
            io.unobserve(e.target)
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.06 },
    )

    const observe = () => nodes().forEach((n) => !n.classList.contains('is-in') && io.observe(n))
    observe()

    let last = window.scrollY
    let raf = 0
    const sweep = () => {
      raf = 0
      const y = window.scrollY
      if (Math.abs(y - last) > window.innerHeight * 0.75) {
        const fold = window.innerHeight * 0.92
        for (const n of nodes()) {
          if (n.classList.contains('is-in')) continue
          if (n.getBoundingClientRect().top < fold) {
            n.classList.add('is-in')
            io.unobserve(n)
          }
        }
      }
      last = y
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(sweep)
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    // Anything added later (a menu category switching in) still needs letting in.
    const mo = new MutationObserver(observe)
    mo.observe(document.body, { childList: true, subtree: true })

    return () => {
      io.disconnect()
      mo.disconnect()
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [reduced])
}

/* ── scroll ──────────────────────────────────────────────────────── */

/** Scroll position and direction, sampled once per frame. */
export function useScrollState() {
  const [state, setState] = useState({ y: 0, up: false, past: false })
  useEffect(() => {
    let raf = 0
    let prev = window.scrollY
    const read = () => {
      raf = 0
      const y = window.scrollY
      setState((s) => {
        const up = y < prev - 2 ? true : y > prev + 2 ? false : s.up
        const past = y > 24
        prev = y
        if (s.y === y && s.up === up && s.past === past) return s
        return { y, up, past }
      })
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    window.addEventListener('scroll', on, { passive: true })
    read()
    return () => {
      window.removeEventListener('scroll', on)
      cancelAnimationFrame(raf)
    }
  }, [])
  return state
}

/**
 * How far an element has travelled through the viewport, 0 → 1.
 * Writes `--p` on the element rather than setting React state, so a
 * parallax costs one custom-property write per frame and no re-render.
 */
export function useTrack(reduced) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduced) {
      el.style.setProperty('--p', '0.5')
      return
    }
    let raf = 0
    let box = { top: 0, height: 1 }
    const measure = () => {
      const r = el.getBoundingClientRect()
      box = { top: r.top + window.scrollY, height: r.height }
    }
    const read = () => {
      raf = 0
      const vh = window.innerHeight
      const p = (window.scrollY + vh - box.top) / (box.height + vh)
      el.style.setProperty('--p', String(Math.min(1, Math.max(0, p))))
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    measure()
    read()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', () => {
      measure()
      on()
    })
    return () => {
      window.removeEventListener('scroll', on)
      cancelAnimationFrame(raf)
    }
  }, [reduced])
  return ref
}

/* ── pointer ─────────────────────────────────────────────────────── */

/**
 * Magnetism. The element leans toward the cursor while the cursor is
 * inside a margin around it, and springs back on leave.
 *
 * Fine pointers only: on a touch screen there is no hover state to
 * lean into, and the listeners are pure cost.
 */
export function useMagnetic(strength = 0.32, reduced = false) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduced || !window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return

    let raf = 0
    let target = { x: 0, y: 0 }
    let cur = { x: 0, y: 0 }
    let running = false

    const tick = () => {
      cur.x += (target.x - cur.x) * 0.18
      cur.y += (target.y - cur.y) * 0.18
      el.style.transform = `translate3d(${cur.x.toFixed(2)}px, ${cur.y.toFixed(2)}px, 0)`
      if (Math.abs(target.x - cur.x) > 0.08 || Math.abs(target.y - cur.y) > 0.08) {
        raf = requestAnimationFrame(tick)
      } else {
        el.style.transform = `translate3d(${target.x}px, ${target.y}px, 0)`
        raf = 0
        running = false
      }
    }
    const start = () => {
      if (!running) {
        running = true
        raf = requestAnimationFrame(tick)
      }
    }

    const onMove = (e) => {
      const r = el.getBoundingClientRect()
      const dx = e.clientX - (r.left + r.width / 2)
      const dy = e.clientY - (r.top + r.height / 2)
      const reach = Math.max(r.width, r.height) * 0.9
      if (Math.abs(dx) > reach || Math.abs(dy) > reach) {
        target = { x: 0, y: 0 }
      } else {
        target = { x: dx * strength, y: dy * strength }
      }
      start()
    }
    const onLeave = () => {
      target = { x: 0, y: 0 }
      start()
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('blur', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('blur', onLeave)
      cancelAnimationFrame(raf)
      el.style.transform = ''
    }
  }, [strength, reduced])
  return ref
}

/** Pointer position inside an element, as 0→1 on each axis, for tilt. */
export function usePointerIn(reduced) {
  const ref = useRef(null)
  const set = useCallback((x, y) => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--mx', x.toFixed(3))
    el.style.setProperty('--my', y.toFixed(3))
  }, [])
  useEffect(() => {
    const el = ref.current
    if (!el || reduced) return
    if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return
    let raf = 0
    let pending = null
    const flush = () => {
      raf = 0
      if (pending) set(pending[0], pending[1])
    }
    const onMove = (e) => {
      const r = el.getBoundingClientRect()
      pending = [(e.clientX - r.left) / r.width - 0.5, (e.clientY - r.top) / r.height - 0.5]
      if (!raf) raf = requestAnimationFrame(flush)
    }
    const onLeave = () => {
      pending = [0, 0]
      if (!raf) raf = requestAnimationFrame(flush)
    }
    el.addEventListener('pointermove', onMove, { passive: true })
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      cancelAnimationFrame(raf)
    }
  }, [reduced, set])
  return ref
}

/** Which section is currently under the nav, for the active link state. */
export function useActiveSection(ids) {
  const [active, setActive] = useState(ids[0])
  useEffect(() => {
    let raf = 0
    const read = () => {
      raf = 0
      const line = window.innerHeight * 0.34
      let found = ids[0]
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= line) found = id
      }
      setActive((a) => (a === found ? a : found))
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    window.addEventListener('scroll', on, { passive: true })
    read()
    return () => {
      window.removeEventListener('scroll', on)
      cancelAnimationFrame(raf)
    }
  }, [ids])
  return active
}
