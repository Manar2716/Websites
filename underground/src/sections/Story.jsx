import { story } from '../data/content.js'
import Media from '../components/Media.jsx'
import { Eyebrow, Words } from '../components/ui.jsx'
import { useTrack } from '../lib/hooks.js'

/* ═══════════════════════════════════════════════════════════════════
   OUR STORY

   A split: a tall leaf-arch picture that drifts against the scroll on
   one side, the story on the other, four facts underneath.

   The four facts are deliberately not achievements. Nobody can source
   "10,000 breakfasts served", so nothing here claims one — they are
   four things about what the kitchen is, where it is and when it is
   open, each carrying its own provenance in the content file.
   ═══════════════════════════════════════════════════════════════════ */

export default function Story({ reduced }) {
  const track = useTrack(reduced)

  return (
    <section id="story" className="relative scroll-mt-24 py-[clamp(5rem,13vh,9rem)]">
      <div className="shell">
        <div className="grid gap-[clamp(2.5rem,6vw,5rem)] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] lg:items-center">
          <div ref={track} className="relative order-2 lg:order-1">
            <div className="mask-reveal frame aspect-[4/5] w-full">
              <div
                className="mask-reveal__inner h-full w-full will-change-transform"
                style={{ transform: 'translate3d(0, calc((var(--p, .5) - .5) * -6%), 0)' }}
              >
                <Media art="about" photo={story.photo} alt={story.photoAlt} />
              </div>
            </div>

            <div
              data-reveal
              style={{ '--d': 3 }}
              className="card absolute -bottom-7 -right-2 max-w-[15rem] px-5 py-4 sm:-right-6 sm:max-w-[17rem]"
            >
              <p className="t-label text-[0.6rem] text-leaf">Drawn, not photographed</p>
              <p className="mt-2 text-[0.82rem] leading-relaxed text-ink-soft">
                Every picture here is generated in code and is a slot waiting for
                Underground&rsquo;s own photograph.
              </p>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div data-reveal>
              <Eyebrow>{story.eyebrow}</Eyebrow>
            </div>

            <h2 className="t-h1 mt-6 max-w-[16ch]" data-reveal-group>
              <Words text={story.title} stagger={56} />
            </h2>

            <div className="mt-7 max-w-[54ch] space-y-5">
              {story.body.map((p, i) => (
                <p key={i} className="t-lead" data-reveal style={{ '--d': 2 + i }}>
                  {p}
                </p>
              ))}
            </div>

            <blockquote
              data-reveal
              style={{ '--d': 4 }}
              className="t-serif mt-9 border-l-2 border-lime pl-6 text-[clamp(1.25rem,1rem+1vw,1.75rem)] leading-[1.28] text-ink"
            >
              {story.pull}
            </blockquote>
          </div>
        </div>

        <div className="mt-[clamp(3.5rem,8vh,6rem)]">
          <div className="rule rule-draw" data-reveal />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-9 pt-9 lg:grid-cols-4">
            {story.stats.map((s, i) => (
              <div key={s.k} data-reveal style={{ '--d': i }}>
                <dt className="t-label text-[0.62rem] text-leaf">{s.k}</dt>
                <dd className="t-serif mt-3 text-[clamp(1.8rem,1.35rem+1.8vw,2.8rem)] leading-none text-ink">
                  {s.v}
                </dd>
                <dd className="mt-2 text-[0.82rem] text-ink-soft">{s.note}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}
