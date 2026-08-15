import { useEffect, useRef } from 'react'
import { ritual } from '../data/content.js'
import Painting from '../components/Painting.jsx'
import { Eyebrow, Words } from '../components/ui.jsx'

/* ═══════════════════════════════════════════════════════════════════
   THE RITUAL — the horizontal section

   Five panels that move sideways while the page is pinned. This is the
   one place on the site where a horizontal rail earns its keep: the
   five steps are a sequence, and a sequence read left to right is
   easier to hold than five stacked cards.

   The pin is a sticky child inside a tall parent. The vertical
   distance the parent adds is derived from the actual width of the
   track, so the rail always finishes exactly as the pin releases —
   no dead scroll at the end, no panel left half off-screen.

   With reduced motion it is not a rail at all: the same five panels
   stack and the parent collapses to its natural height.
   ═══════════════════════════════════════════════════════════════════ */

export default function Ritual({ reduced }) {
  const section = useRef(null)
  const track = useRef(null)

  useEffect(() => {
    if (reduced) return
    const sec = section.current
    const tr = track.current
    if (!sec || !tr) return

    let raf = 0
    let dx = 0
    let top = 0
    let span = 1

    const measure = () => {
      const vw = window.innerWidth
      const vh = window.innerHeight
      dx = Math.max(0, tr.scrollWidth - vw)
      // The parent is one screen (the pin) plus the sideways distance,
      // eased out a little so the rail is not 1:1 with the wheel.
      sec.style.height = `${vh + dx * 0.92}px`
      const r = sec.getBoundingClientRect()
      top = r.top + window.scrollY
      span = Math.max(1, sec.offsetHeight - vh)
    }

    const read = () => {
      raf = 0
      const p = Math.min(1, Math.max(0, (window.scrollY - top) / span))
      tr.style.transform = `translate3d(${(-dx * p).toFixed(2)}px, 0, 0)`
      sec.style.setProperty('--rp', p.toFixed(4))
    }

    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    const onResize = () => {
      measure()
      read()
    }

    measure()
    read()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', onResize)
    // Fonts landing changes panel widths, so re-measure once they do.
    document.fonts?.ready.then(onResize).catch(() => {})
    return () => {
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(raf)
      sec.style.height = ''
    }
  }, [reduced])

  // In the rail the panel is a full-height column: the picture takes
  // whatever is left after the words, rather than the words taking
  // whatever is left after a fixed 4:5 picture — which is how they
  // ended up below the fold of a pinned viewport.
  const panels = ritual.steps.map((s, i) => (
    <article
      key={s.n}
      className={[
        'group relative flex shrink-0 flex-col',
        reduced
          ? 'w-full'
          : 'h-full w-[min(74vw,22rem)] sm:w-[min(52vw,24rem)] lg:w-[min(30vw,27rem)]',
      ].join(' ')}
      data-reveal
      style={{ '--d': i }}
    >
      <div
        className={[
          'frame relative w-full overflow-hidden',
          reduced ? 'aspect-[4/5]' : 'min-h-0 flex-1',
        ].join(' ')}
      >
        <Painting
          id={s.art}
          className="transition-transform duration-[1200ms] ease-[cubic-bezier(.16,1,.3,1)] group-hover:scale-[1.06]"
          alt={`${s.title} — drawn illustration`}
        />
        <span className="absolute left-5 top-5 font-mono text-[0.65rem] tracking-[0.3em] text-brass">
          {s.n}
        </span>
      </div>
      {/* A fixed caption height, so five different sentence lengths do
          not give five different picture heights along the rail. */}
      <div className={reduced ? 'mt-5' : 'mt-5 shrink-0 sm:min-h-[8.5rem]'}>
        <h3 className="t-h3">{s.title}</h3>
        <p className="mt-2.5 max-w-[34ch] text-[0.9rem] leading-relaxed text-dust">{s.body}</p>
      </div>
    </article>
  ))

  if (reduced) {
    return (
      <section className="py-[clamp(4rem,10vh,7rem)]">
        <div className="shell">
          <Header />
          <div className="mt-12 grid gap-12 sm:grid-cols-2 lg:grid-cols-3">{panels}</div>
        </div>
      </section>
    )
  }

  return (
    <section ref={section} className="relative bg-basalt">
      <div className="sticky top-0 flex h-[100svh] flex-col overflow-hidden pb-8 pt-[calc(var(--nav-h)+1.5rem)] sm:pb-10">
        <div className="shell w-full shrink-0">
          <Header />
        </div>

        <div className="mt-8 min-h-0 w-full flex-1 overflow-hidden sm:mt-10">
          <div
            ref={track}
            className="flex h-full w-max gap-6 pl-[var(--gutter)] pr-[var(--gutter)] will-change-transform sm:gap-10"
          >
            {panels}
          </div>
        </div>

        {/* Progress hairline — the only thing telling you how far in you are */}
        <div className="shell mt-6 shrink-0">
          <div className="relative h-px w-full bg-cream/10">
            <span
              className="absolute inset-y-0 left-0 block bg-brass"
              style={{ width: 'calc(var(--rp, 0) * 100%)' }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function Header() {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
      <div>
        <div data-reveal>
          <Eyebrow>{ritual.eyebrow}</Eyebrow>
        </div>
        <h2 className="t-h2 mt-5 max-w-[18ch]" data-reveal-group>
          <Words text={ritual.title} stagger={50} />
        </h2>
      </div>
      <p
        className="hidden max-w-[30ch] font-mono text-[0.66rem] uppercase leading-relaxed tracking-[0.18em] text-dust lg:block"
        data-reveal
        style={{ '--d': 2 }}
      >
        Scroll to move through it
      </p>
    </div>
  )
}
