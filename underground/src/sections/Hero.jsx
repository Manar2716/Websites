import { useEffect, useRef } from 'react'
import { brand, hero } from '../data/content.js'
import Media from '../components/Media.jsx'
import { Magnet, Words } from '../components/ui.jsx'

/* ═══════════════════════════════════════════════════════════════════
   HERO

   A drawn garden terrace, the name across the middle of it, and two
   things to do next.

   The parallax is one number: `--hp` runs 0 → 1 across the first screen
   of scroll and three layers read it at different rates — the garden
   drifts down and swells slightly so it lags the page, the type lifts
   so it leads, and the scrim deepens to hold the words as the picture
   brightens under them. Nothing here sets React state while scrolling.
   ═══════════════════════════════════════════════════════════════════ */

export default function Hero({ reduced }) {
  const root = useRef(null)

  useEffect(() => {
    const el = root.current
    if (!el) return
    if (reduced) {
      el.style.setProperty('--hp', '0')
      return
    }
    let raf = 0
    const read = () => {
      raf = 0
      const p = Math.min(1, Math.max(0, window.scrollY / Math.max(1, window.innerHeight)))
      el.style.setProperty('--hp', p.toFixed(4))
    }
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read)
    }
    read()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      window.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
      cancelAnimationFrame(raf)
    }
  }, [reduced])

  return (
    <section
      id="top"
      ref={root}
      className="relative isolate flex min-h-[100svh] flex-col justify-end overflow-hidden"
      style={{ '--hp': 0 }}
    >
      <div
        className="absolute inset-0 -z-20 will-change-transform"
        style={{ transform: 'translate3d(0, calc(var(--hp) * 11vh), 0) scale(calc(1 + var(--hp) * 0.13))' }}
      >
        <Media art="hero" photo={null} eager alt="" />
      </div>

      {/* Scrim. Weighted to the bottom left, where the type sits, so the
          bright open middle of the garden survives. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            'linear-gradient(186deg, rgba(11,32,24,.5) 0%, rgba(11,32,24,.1) 26%, rgba(11,32,24,.58) 62%, rgba(11,32,24,.92) 100%)',
          opacity: 'calc(0.88 + var(--hp) * 0.12)',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(120% 92% at 0% 100%, rgba(11,32,24,.88) 0%, rgba(11,32,24,.46) 44%, transparent 76%)',
        }}
      />

      <div
        className="shell relative pb-[clamp(3.5rem,9vh,7rem)] pt-[calc(var(--nav-h)+3rem)] will-change-transform"
        style={{
          transform: 'translate3d(0, calc(var(--hp) * -7vh), 0)',
          opacity: 'calc(1 - var(--hp) * 0.85)',
        }}
      >
        <div data-reveal-group className="is-in">
          <p className="t-label mb-5 flex items-center gap-2.5 text-lime sm:mb-7">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-lime" aria-hidden="true" />
            {brand.sub}
          </p>

          <h1 className="t-display text-canvas">
            <Words text="UNDERGROUND" delay={120} stagger={0} />
          </h1>

          <p className="mt-5 max-w-[26ch] font-display text-[clamp(1.35rem,1rem+1.6vw,2.3rem)] leading-[1.15] text-lime sm:mt-7"
             style={{ fontVariationSettings: "'SOFT' 60, 'WONK' 1, 'opsz' 60" }}>
            <Words text={brand.tagline} delay={420} stagger={60} />
          </p>
        </div>

        <div
          className="mt-8 grid gap-8 sm:mt-11 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-14"
          data-reveal
          style={{ '--d': 5 }}
        >
          <p className="max-w-[50ch] text-[1.02rem] leading-relaxed text-canvas/85">{hero.standfirst}</p>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <Magnet as="a" href="#menu" skin="gold" arrow reduced={reduced} data-cursor="link">
              Explore Menu
            </Magnet>
            <Magnet as="a" href="#visit" skin="ghostLight" arrow reduced={reduced} data-cursor="link">
              Visit Us
            </Magnet>
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-6 right-[var(--gutter)] hidden items-center gap-3 md:flex"
        style={{ opacity: 'calc(1 - var(--hp) * 3)' }}
      >
        <span className="t-label text-[0.6rem] text-canvas/70">{hero.scrollHint}</span>
        <span className="relative block h-12 w-px overflow-hidden bg-canvas/25">
          <span className="absolute inset-x-0 top-0 block h-4 animate-[hint_2.4s_ease-in-out_infinite] bg-lime" />
        </span>
      </div>

      <style>{`@keyframes hint{0%{transform:translateY(-100%)}60%,100%{transform:translateY(300%)}}`}</style>
    </section>
  )
}
