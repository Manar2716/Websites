import { useEffect, useMemo, useRef, useState } from 'react'
import { useMagnetic } from '../lib/hooks.js'

/* ═══════════════════════════════════════════════════════════════════
   THE SMALL PARTS

   Everything here is used at least three times on the page. Anything
   used once lives in the section that uses it.
   ═══════════════════════════════════════════════════════════════════ */

/* ── type ────────────────────────────────────────────────────────── */

/**
 * Words rise into place one after another from behind a mask.
 *
 * The whole string stays in the accessibility tree as one label and
 * the per-word spans are hidden from it, so a screen reader hears a
 * sentence rather than a list of words.
 */
export function Words({ text, className = '', as: Tag = 'span', delay = 0, stagger = 42 }) {
  const words = useMemo(() => text.split(' '), [text])
  return (
    <Tag className={className} aria-label={text}>
      {words.map((w, i) => (
        <span
          key={`${w}-${i}`}
          aria-hidden="true"
          className="inline-block overflow-hidden align-bottom"
          style={{ paddingBottom: '0.12em', marginBottom: '-0.12em' }}
        >
          <span
            className="word inline-block"
            style={{ '--wd': `${delay + i * stagger}ms` }}
          >
            {w}
            {i < words.length - 1 ? ' ' : ''}
          </span>
        </span>
      ))}
    </Tag>
  )
}

export function Eyebrow({ children, className = '' }) {
  return (
    <span className={`t-eyebrow inline-flex items-center gap-3 ${className}`}>
      <span className="h-px w-8 bg-brass/60" aria-hidden="true" />
      {children}
    </span>
  )
}

/* ── buttons ─────────────────────────────────────────────────────── */

const BASE =
  'group relative inline-flex items-center justify-center gap-3 rounded-full ' +
  'font-mono text-[0.72rem] tracking-[0.2em] uppercase whitespace-nowrap ' +
  'px-7 py-4 min-h-12 transition-colors duration-500 will-change-transform'

const SKINS = {
  solid: 'bg-cream text-ground hover:bg-brass',
  ghost: 'border border-cream/25 text-cream hover:border-brass hover:text-brass',
  brass: 'bg-brass text-ground hover:bg-brass-lit',
}

/**
 * A button that leans toward the cursor. The magnetism is on an inner
 * wrapper, so the hit area itself never moves out from under the
 * pointer — a magnetic button whose *target* runs away is a trap.
 */
export function Magnet({
  as = 'a',
  skin = 'ghost',
  arrow = false,
  external = false,
  className = '',
  children,
  reduced = false,
  ...props
}) {
  const ref = useMagnetic(0.26, reduced)
  const Tag = as
  const ext = external ? { target: '_blank', rel: 'noopener noreferrer' } : {}
  // The wrapper carries no `display` of its own. It used to hard-code
  // `inline-flex`, which put two display utilities on the same element
  // and let stylesheet order — not class order — decide whether a
  // `hidden sm:inline-flex` button was actually hidden on a phone.
  return (
    <Tag className={className || 'inline-flex'} {...ext} {...props}>
      <span ref={ref} className={`${BASE} ${SKINS[skin]}`}>
        <span>{children}</span>
        {arrow && <Arrow />}
        {external && !arrow && <ArrowOut />}
      </span>
    </Tag>
  )
}

export function Arrow({ className = '' }) {
  return (
    <svg
      viewBox="0 0 20 12"
      width="20"
      height="12"
      aria-hidden="true"
      className={`shrink-0 transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] group-hover:translate-x-1.5 ${className}`}
    >
      <path d="M0 6h17M12 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

export function ArrowOut({ className = '' }) {
  return (
    <svg
      viewBox="0 0 14 14"
      width="13"
      height="13"
      aria-hidden="true"
      className={`shrink-0 transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] group-hover:translate-x-1 group-hover:-translate-y-1 ${className}`}
    >
      <path d="M3 11L11 3M4.5 3H11v6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

/** A text link with a rule that wipes in from the left on hover. */
export function Underline({ children, className = '', external = false, ...props }) {
  const ext = external ? { target: '_blank', rel: 'noopener noreferrer' } : {}
  return (
    <a
      className={`group relative inline-flex items-center gap-1.5 ${className}`}
      {...ext}
      {...props}
    >
      <span className="relative">
        {children}
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 left-0 h-px w-full origin-right scale-x-0 bg-current transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] group-hover:origin-left group-hover:scale-x-100"
        />
      </span>
      {external && <ArrowOut />}
    </a>
  )
}

/* ── atmosphere ──────────────────────────────────────────────────── */

/**
 * Film grain over the whole page.
 *
 * The tile is generated once into a 128px canvas and handed to CSS as a
 * data URL. Animating `background-position` on a fixed layer is free;
 * regenerating noise every frame, or blurring a full-viewport layer
 * whose contents move, is not — so neither happens here.
 */
export function Grain() {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const ctx = c.getContext('2d')
    const img = ctx.createImageData(128, 128)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 118 + Math.random() * 74
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 26 + Math.random() * 42
    }
    ctx.putImageData(img, 0, 0)
    setUrl(c.toDataURL('image/png'))
  }, [])
  if (!url) return null
  return <div className="grain" aria-hidden="true" style={{ backgroundImage: `url(${url})` }} />
}

/**
 * The cursor becomes a small circle that grows over anything
 * interactive and shows a word over the gallery. Desktop only — the
 * CSS hides it outright on a coarse pointer, and the listeners are
 * never attached there either.
 */
export function Cursor({ reduced }) {
  const dot = useRef(null)
  const [mode, setMode] = useState('idle')

  useEffect(() => {
    if (reduced) return
    if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return
    const el = dot.current
    if (!el) return

    let raf = 0
    const target = { x: innerWidth / 2, y: innerHeight / 2 }
    const cur = { ...target }
    let seen = false

    const tick = () => {
      cur.x += (target.x - cur.x) * 0.2
      cur.y += (target.y - cur.y) * 0.2
      el.style.transform = `translate3d(${cur.x}px, ${cur.y}px, 0) translate(-50%, -50%)`
      raf = requestAnimationFrame(tick)
    }

    const onMove = (e) => {
      target.x = e.clientX
      target.y = e.clientY
      if (!seen) {
        seen = true
        cur.x = target.x
        cur.y = target.y
        el.style.opacity = '1'
      }
      const over = e.target instanceof Element ? e.target.closest('[data-cursor]') : null
      const next = over?.getAttribute('data-cursor') || 'idle'
      setMode((m) => (m === next ? m : next))
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    raf = requestAnimationFrame(tick)
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
    }
  }, [reduced])

  const size = mode === 'view' ? 84 : mode === 'link' ? 46 : 14

  return (
    <div
      ref={dot}
      className="cursor grid place-items-center"
      style={{
        opacity: 0,
        width: size,
        height: size,
        background: mode === 'idle' ? '#EDE7DC' : 'transparent',
        border: mode === 'idle' ? 'none' : '1px solid #EDE7DC',
        transition: 'width .45s cubic-bezier(.16,1,.3,1), height .45s cubic-bezier(.16,1,.3,1), background .3s',
      }}
      aria-hidden="true"
    >
      <span
        className="font-mono text-[0.55rem] tracking-[0.22em] text-cream"
        style={{ opacity: mode === 'view' ? 1 : 0, transition: 'opacity .3s' }}
      >
        VIEW
      </span>
    </div>
  )
}
