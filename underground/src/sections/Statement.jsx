import { cta, business, OFFICIAL_URL } from '../data/content.js'
import { Magnet, Words } from '../components/ui.jsx'
import { useTrack } from '../lib/hooks.js'

/* ═══════════════════════════════════════════════════════════════════
   STATEMENT

   The last thing before the footer, and the only place on the page
   where the type is allowed to be the whole composition. Four ways to
   act on it, in the order somebody standing in Dubai at half past
   eleven at night would want them.
   ═══════════════════════════════════════════════════════════════════ */

export default function Statement({ reduced }) {
  const track = useTrack(reduced)

  return (
    <section
      id="contact"
      ref={track}
      className="relative scroll-mt-20 overflow-hidden border-t border-cream/10 py-[clamp(5.5rem,16vh,11rem)]"
    >
      {/* A single pool of brass behind the type, drifting with the scroll */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(60% 55% at 50% 42%, rgba(195,154,98,.15), transparent 70%)',
          transform: 'translate3d(0, calc((var(--p, .5) - .5) * -18%), 0)',
        }}
      />

      <div className="shell text-center">
        <h2
          className="mx-auto max-w-[15ch] font-display text-[clamp(2.6rem,1.1rem+9vw,9rem)] leading-[0.9] tracking-[-0.03em] text-cream"
          data-reveal-group
        >
          <Words text={cta.statement} stagger={72} />
        </h2>

        <p
          className="mx-auto mt-8 font-mono text-[clamp(0.72rem,0.66rem+0.3vw,0.9rem)] uppercase tracking-[0.34em] text-brass"
          data-reveal
          style={{ '--d': 3 }}
        >
          {cta.sub}
        </p>

        <p className="mt-5 text-[0.9rem] text-dust" data-reveal style={{ '--d': 4 }}>
          {cta.line}
        </p>

        <div
          className="mt-11 flex flex-wrap items-center justify-center gap-3 sm:gap-4"
          data-reveal
          style={{ '--d': 5 }}
        >
          <Magnet
            as="a"
            href={business.directions}
            external
            skin="solid"
            arrow
            reduced={reduced}
            data-cursor="link"
          >
            Get Directions
          </Magnet>
          <Magnet
            as="a"
            href={`tel:${business.phone.tel}`}
            skin="ghost"
            reduced={reduced}
            data-cursor="link"
          >
            Call {business.phone.display}
          </Magnet>
          <Magnet
            as="a"
            href={business.social[0].href}
            external
            skin="ghost"
            reduced={reduced}
            data-cursor="link"
          >
            Instagram
          </Magnet>
          <Magnet
            as="a"
            href={OFFICIAL_URL}
            external
            skin="brass"
            reduced={reduced}
            data-cursor="link"
          >
            Visit Official Website
          </Magnet>
        </div>
      </div>
    </section>
  )
}
