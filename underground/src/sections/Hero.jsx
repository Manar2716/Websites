import { useEffect, useRef } from 'react'
import { brand, hero } from '../data/content.js'
import Painting from '../components/Painting.jsx'
import { Magnet, Words } from '../components/ui.jsx'

/* ═══════════════════════════════════════════════════════════════════
   HERO

   The first five seconds. A drawn room behind, the word over it, and
   two things to do next.

   The parallax is one number. A single rAF-driven custom property,
   `--hp`, runs 0 → 1 across the first screen of scroll, and three
   layers read it at different rates: the room drifts down and swells
   slightly (so it lags the page), the type lifts (so it leads), and
   the scrim deepens to keep the words legible as the picture brightens
   under them. Nothing here sets React state while scrolling.
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
      {/* The room */}
      <div
        className="absolute inset-0 -z-20 will-change-transform"
        style={{
          transform:
            'translate3d(0, calc(var(--hp) * 12vh), 0) scale(calc(1 + var(--hp) * 0.14))',
        }}
      >
        <Painting id="hero" eager className="h-full w-full" style={{ height: '100%' }} />
      </div>

      {/* Scrim. Deepens as the picture rises, so the type never has to
          fight the brightest part of the frame. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            'linear-gradient(180deg, rgba(10,10,11,.86) 0%, rgba(10,10,11,.34) 26%, rgba(10,10,11,.68) 58%, rgba(10,10,11,.97) 100%)',
          opacity: 'calc(0.86 + var(--hp) * 0.14)',
        }}
      />
      {/* A second scrim, thrown from the corner the headline sits in.
          The word crosses the brightest part of the picture, and a flat
          overlay strong enough to fix that would flatten the whole room. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(112% 92% at 0% 100%, rgba(10,10,11,.88) 0%, rgba(10,10,11,.5) 42%, transparent 72%)',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-40"
        style={{ background: 'linear-gradient(180deg, transparent, var(--color-ground))' }}
      />

      {/* The words */}
      <div
        className="shell relative pb-[clamp(3.5rem,9vh,7rem)] pt-[calc(var(--nav-h)+3rem)] will-change-transform"
        style={{
          transform: 'translate3d(0, calc(var(--hp) * -7vh), 0)',
          opacity: 'calc(1 - var(--hp) * 0.85)',
        }}
      >
        <div data-reveal-group className="is-in">
          <p className="t-mono mb-6 flex items-center gap-3 text-bone sm:mb-8">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brass" aria-hidden="true" />
            {brand.sub}
          </p>

          <h1 className="t-display text-cream">
            <Words text="UNDERGROUND" delay={120} stagger={0} />
          </h1>

          <p className="mt-5 max-w-[24ch] font-display text-[clamp(1.5rem,1.1rem+1.8vw,2.6rem)] leading-[1.12] text-brass sm:mt-7">
            <Words text={brand.tagline} delay={420} stagger={70} />
          </p>
        </div>

        <div
          className="mt-8 grid gap-8 sm:mt-11 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-14"
          data-reveal
          style={{ '--d': 5 }}
        >
          <p className="t-lead max-w-[52ch] text-bone">{hero.standfirst}</p>

          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <Magnet as="a" href="#menu" skin="solid" arrow reduced={reduced} data-cursor="link">
              View Menu
            </Magnet>
            <Magnet as="a" href="#location" skin="ghost" arrow reduced={reduced} data-cursor="link">
              Visit Us
            </Magnet>
          </div>
        </div>
      </div>

      {/* Scroll hint, bottom right, fading out as soon as you take it */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-6 right-[var(--gutter)] hidden items-center gap-3 md:flex"
        style={{ opacity: 'calc(1 - var(--hp) * 3)' }}
      >
        <span className="font-mono text-[0.6rem] tracking-[0.32em] text-dust">
          {hero.scrollHint}
        </span>
        <span className="relative block h-12 w-px overflow-hidden bg-cream/15">
          <span className="absolute inset-x-0 top-0 block h-4 animate-[hint_2.4s_ease-in-out_infinite] bg-brass" />
        </span>
      </div>

      <style>{`@keyframes hint{0%{transform:translateY(-100%)}60%,100%{transform:translateY(300%)}}`}</style>
    </section>
  )
}
