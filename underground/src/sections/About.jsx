import { about } from '../data/content.js'
import Media from '../components/Media.jsx'
import { Eyebrow, Words } from '../components/ui.jsx'
import { useTrack } from '../lib/hooks.js'

/* ═══════════════════════════════════════════════════════════════════
   ABOUT

   A split: a tall picture that drifts against the scroll on one side,
   the story on the other, and four figures underneath.

   The four figures are deliberately not achievements. Nobody can
   source "10,000 cups poured", so nothing here claims one — they are
   four facts about where the place is and when it is open, and the one
   that is not yet known (the year) is shown as `20—` rather than
   guessed at.
   ═══════════════════════════════════════════════════════════════════ */

export default function About({ reduced }) {
  const track = useTrack(reduced)

  return (
    <section id="about" className="relative scroll-mt-24 py-[clamp(5rem,13vh,9rem)]">
      <div className="shell">
        <div className="grid gap-[clamp(2.5rem,6vw,5rem)] lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1fr)] lg:items-center">
          {/* Picture */}
          <div ref={track} className="relative order-2 lg:order-1">
            <div className="mask-reveal frame aspect-[4/5] w-full sm:aspect-[5/6] lg:aspect-[4/5]">
              <div
                className="mask-reveal__inner h-full w-full will-change-transform"
                style={{
                  transform: 'translate3d(0, calc((var(--p, .5) - .5) * -6%), 0)',
                }}
              >
                <Media art="about" photo={about.photo} alt={about.photoAlt ?? ''} />
              </div>
            </div>

            {/* A caption plate, half over the picture, half off it */}
            <div
              data-reveal
              style={{ '--d': 3 }}
              className="card absolute -bottom-6 -right-3 max-w-[15rem] px-5 py-4 sm:-right-6 sm:max-w-[17rem]"
            >
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.24em] text-brass">
                Drawn, not photographed
              </p>
              <p className="mt-2 text-[0.82rem] leading-relaxed text-dust">
                Every picture here is generated in code and is a slot waiting for
                Underground&rsquo;s own photograph &mdash; not a stock photo of
                somebody else&rsquo;s room.
              </p>
            </div>
          </div>

          {/* Story */}
          <div className="order-1 lg:order-2">
            <div data-reveal>
              <Eyebrow>{about.eyebrow}</Eyebrow>
            </div>

            <h2 className="t-h1 mt-6 max-w-[16ch]" data-reveal-group>
              <Words text={about.title} stagger={58} />
            </h2>

            <div className="mt-7 max-w-[54ch] space-y-5">
              {about.body.map((p, i) => (
                <p key={i} className="t-lead" data-reveal style={{ '--d': 2 + i }}>
                  {p}
                </p>
              ))}
            </div>

            <blockquote
              data-reveal
              style={{ '--d': 4 }}
              className="mt-9 border-l border-brass/45 pl-6 font-display text-[clamp(1.3rem,1.05rem+1vw,1.85rem)] leading-[1.25] text-cream"
            >
              {about.pull}
            </blockquote>
          </div>
        </div>

        {/* The four figures */}
        <div className="mt-[clamp(3.5rem,8vh,6rem)]">
          <div className="rule rule-draw" data-reveal />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-9 pt-9 lg:grid-cols-4">
            {about.stats.map((s, i) => (
              <div key={s.k} data-reveal style={{ '--d': i }} className="group">
                <dt className="font-mono text-[0.62rem] uppercase tracking-[0.3em] text-brass">
                  {s.k}
                </dt>
                <dd className="mt-3 font-display text-[clamp(1.9rem,1.4rem+1.9vw,3rem)] leading-none text-cream">
                  {s.v}
                </dd>
                <dd className="mt-2 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-dust">
                  {s.note}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}
