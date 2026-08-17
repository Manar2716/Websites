import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useMagnetic } from '../lib/hooks.js'

/* ═══════════════════════════════════════════════════════════════════
   THE SMALL PARTS
   Everything here is used at least three times on the page.
   ═══════════════════════════════════════════════════════════════════ */

/* ── type ────────────────────────────────────────────────────────── */

/**
 * Words rise into place one after another from behind a mask. The whole
 * string stays in the accessibility tree as one label and the per-word
 * spans are hidden, so a screen reader hears a sentence rather than a
 * list of words.
 */
export function Words({ text, className = '', as: Tag = 'span', delay = 0, stagger = 42 }) {
  const words = useMemo(() => text.split(' '), [text])
  return (
    <Tag className={className} aria-label={text}>
      {words.map((w, i) => (
        <Fragment key={`${w}-${i}`}>
          <span
            aria-hidden="true"
            className="inline-block overflow-hidden align-bottom"
            style={{ paddingBottom: '0.14em', marginBottom: '-0.14em' }}
          >
            <span className="word inline-block" style={{ '--wd': `${delay + i * stagger}ms` }}>
              {w}
            </span>
          </span>
          {/* The space lives between the masked spans, not inside one:
              a trailing space inside an inline-block is collapsed away,
              which runs every word of the headline together. */}
          {i < words.length - 1 && <span aria-hidden="true"> </span>}
        </Fragment>
      ))}
    </Tag>
  )
}

/** A small drawn sprig, used beside eyebrows and the logo. */
export function Sprig({ className = '', size = 18 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path
        d="M12 22V6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M12 13c0-4 3-6.5 7-7-.4 4.2-3 7-7 7ZM12 16c0-3.4-2.6-5.6-6-6 .3 3.6 2.6 6 6 6Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function Eyebrow({ children, className = '', sprig = true }) {
  return (
    <span className={`t-label inline-flex items-center gap-2.5 text-leaf ${className}`}>
      {sprig && <Sprig size={16} className="text-lime" />}
      {children}
    </span>
  )
}

/* ── buttons ─────────────────────────────────────────────────────── */

const BASE =
  'group relative inline-flex items-center justify-center gap-2.5 rounded-full ' +
  'font-sans text-[0.74rem] font-semibold tracking-[0.16em] uppercase whitespace-nowrap ' +
  'px-7 py-4 min-h-12 transition-colors duration-500 will-change-transform'

const SKINS = {
  leaf: 'bg-deep text-canvas hover:bg-leaf',
  gold: 'bg-gold-lit text-frond hover:bg-lime',
  ghost: 'border border-ink/25 text-ink hover:border-leaf hover:text-leaf',
  ghostLight: 'border border-canvas/35 text-canvas hover:border-lime hover:text-lime',
}

/**
 * A button that leans toward the cursor. The magnetism is on an inner
 * wrapper so the hit area never moves out from under the pointer — a
 * magnetic button whose target runs away is a trap.
 */
export function Magnet({
  as = 'a',
  skin = 'leaf',
  arrow = false,
  external = false,
  className = '',
  children,
  reduced = false,
  ...props
}) {
  const ref = useMagnetic(0.24, reduced)
  const Tag = as
  const ext = external ? { target: '_blank', rel: 'noopener noreferrer' } : {}
  // No `display` of its own: two display utilities on one element lets
  // stylesheet order, not class order, decide whether `hidden sm:flex`
  // actually hides.
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
      width="19"
      height="12"
      aria-hidden="true"
      className={`shrink-0 transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] group-hover:translate-x-1.5 ${className}`}
    >
      <path d="M0 6h17M12 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function ArrowOut({ className = '' }) {
  return (
    <svg
      viewBox="0 0 14 14"
      width="12"
      height="12"
      aria-hidden="true"
      className={`shrink-0 transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] group-hover:translate-x-1 group-hover:-translate-y-1 ${className}`}
    >
      <path d="M3 11L11 3M4.5 3H11v6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

/** A text link with a rule that wipes in from the left on hover. */
export function Underline({ children, className = '', external = false, ...props }) {
  const ext = external ? { target: '_blank', rel: 'noopener noreferrer' } : {}
  return (
    <a className={`group relative inline-flex items-center gap-1.5 ${className}`} {...ext} {...props}>
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
 * Paper grain over the whole page, multiplied rather than overlaid —
 * this is a printed-looking page, not a filmed one, and the tile is
 * warm rather than neutral so it settles into the cream instead of
 * greying it.
 */
export function Grain() {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const ctx = c.getContext('2d')
    const img = ctx.createImageData(128, 128)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random()
      img.data[i] = 150 + v * 60
      img.data[i + 1] = 148 + v * 58
      img.data[i + 2] = 128 + v * 54
      img.data[i + 3] = 10 + Math.random() * 26
    }
    ctx.putImageData(img, 0, 0)
    setUrl(c.toDataURL('image/png'))
  }, [])
  if (!url) return null
  return <div className="grain" aria-hidden="true" style={{ backgroundImage: `url(${url})` }} />
}

/**
 * The cursor becomes a small leaf-green disc that grows over anything
 * interactive. Desktop only — the CSS hides it on a coarse pointer and
 * the listeners are never attached there.
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

  const size = mode === 'view' ? 88 : mode === 'link' ? 42 : 12

  return (
    <div
      ref={dot}
      className="cursor grid place-items-center"
      style={{
        opacity: 0,
        width: size,
        height: size,
        background: mode === 'view' ? 'rgba(18,48,36,.86)' : mode === 'idle' ? '#2f6b45' : 'transparent',
        border: mode === 'link' ? '1.5px solid #2f6b45' : 'none',
        transition:
          'width .45s cubic-bezier(.16,1,.3,1), height .45s cubic-bezier(.16,1,.3,1), background .3s',
      }}
      aria-hidden="true"
    >
      <span
        className="t-label text-[0.55rem] text-canvas"
        style={{ opacity: mode === 'view' ? 1 : 0, transition: 'opacity .3s' }}
      >
        LOOK
      </span>
    </div>
  )
}
