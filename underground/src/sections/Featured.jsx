import { featured } from '../data/content.js'
import Media from '../components/Media.jsx'
import { Eyebrow, Words } from '../components/ui.jsx'
import { useTrack } from '../lib/hooks.js'

/* ═══════════════════════════════════════════════════════════════════
   FEATURED

   One dish, printed full width, with the type set over the empty third
   of the frame rather than in a box beside it.

   Hover is an enhancement, not the only way in: pointing at it pushes
   the picture in a few per cent and brings the three lines of detail
   up. On a touch screen there is no hover, so those three lines are
   simply always there — the CSS opens them at the same breakpoint the
   hover styles stop applying.
   ═══════════════════════════════════════════════════════════════════ */

export default function Featured({ reduced }) {
  const track = useTrack(reduced)

  return (
    <section className="relative">
      <div
        ref={track}
        data-cursor="view"
        className="group relative isolate flex min-h-[80svh] items-end overflow-hidden lg:min-h-[88svh]"
      >
        {/* The dish */}
        <div
          className="absolute inset-0 -z-20 will-change-transform"
          style={{
            transform:
              'translate3d(0, calc((var(--p, .5) - .5) * -7%), 0) scale(1.08)',
          }}
        >
          <Media
            art={featured.art}
            photo={featured.photo}
            alt={`${featured.name}${featured.photo ? '' : ' — drawn illustration'}`}
            className="transition-transform duration-[1400ms] ease-[cubic-bezier(.16,1,.3,1)] group-hover:scale-[1.05]"
          />
        </div>

        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10"
          style={{
            background:
              'linear-gradient(100deg, rgba(10,10,11,.95) 0%, rgba(10,10,11,.78) 34%, rgba(10,10,11,.16) 66%, rgba(10,10,11,.6) 100%)',
          }}
        />

        <div className="shell relative w-full pb-[clamp(3rem,8vh,6rem)] pt-[clamp(6rem,18vh,12rem)]">
          <div className="max-w-[38rem]">
            <div data-reveal>
              <Eyebrow>{featured.eyebrow}</Eyebrow>
            </div>

            <h2 className="t-h1 mt-6" data-reveal-group>
              <Words text={featured.name} stagger={64} />
            </h2>

            <p
              className="mt-5 font-display text-[clamp(1.15rem,1rem+0.9vw,1.65rem)] leading-[1.25] text-brass"
              data-reveal
              style={{ '--d': 2 }}
            >
              {featured.kicker}
            </p>

            {/* Opens on hover on a fine pointer; always open otherwise */}
            <div
              className={[
                'grid transition-[grid-template-rows,opacity] duration-[900ms]',
                'ease-[cubic-bezier(.16,1,.3,1)]',
                'grid-rows-[1fr] opacity-100',
                'fine:grid-rows-[0fr] fine:opacity-0',
                'fine:group-hover:grid-rows-[1fr] fine:group-hover:opacity-100',
              ].join(' ')}
            >
              <div className="overflow-hidden">
                <p className="mt-6 max-w-[44ch] text-[0.98rem] leading-relaxed text-bone">
                  {featured.body}
                </p>
              </div>
            </div>

            <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-5" data-reveal style={{ '--d': 3 }}>
              {featured.meta.map((m) => (
                <div key={m.k}>
                  <dt className="font-mono text-[0.6rem] uppercase tracking-[0.28em] text-dust">
                    {m.k}
                  </dt>
                  <dd className="mt-1.5 text-[0.95rem] text-cream">{m.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* A hairline that draws across the bottom of the frame */}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-px origin-left bg-brass/40"
          style={{ transform: 'scaleX(var(--p, 0))' }}
        />
      </div>
    </section>
  )
}
