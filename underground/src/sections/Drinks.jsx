import { drinks, OFFICIAL_URL } from '../data/content.js'
import Media from '../components/Media.jsx'
import { Eyebrow, Magnet, Words } from '../components/ui.jsx'
import { useTrack } from '../lib/hooks.js'

/* ═══════════════════════════════════════════════════════════════════
   DRINKS

   Cream ground, deep-green card, three drinks in pill frames.

   This section names no individual drink, deliberately. The menu runs
   Hot Drinks, Cold Drinks and a British Drinks list, but not one drink
   could be sourced by name — so the section sells the counter rather
   than a list, and the button goes to the real menu. The three pictures
   are generic coffee and cold drinks, captioned as such.
   ═══════════════════════════════════════════════════════════════════ */

const CAPTIONS = ['Cold, over ice', 'Hot, with milk', 'Cold and sharp']

export default function Drinks({ reduced }) {
  const track = useTrack(reduced)

  return (
    <section className="relative py-[clamp(5rem,13vh,9rem)]">
      <div className="shell">
        <div
          ref={track}
          className="on-deep relative overflow-hidden rounded-[2rem] px-[clamp(1.5rem,5vw,4.5rem)] py-[clamp(3rem,8vh,5.5rem)] sm:rounded-[3rem]"
        >
          <div className="relative grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
            <div>
              <div data-reveal>
                <Eyebrow className="text-lime">{drinks.eyebrow}</Eyebrow>
              </div>
              <h2 className="t-h2 mt-6 max-w-[14ch]" data-reveal-group>
                <Words text={drinks.title} stagger={56} />
              </h2>
              <p className="t-lead mt-6 max-w-[42ch]" data-reveal style={{ '--d': 2 }}>
                {drinks.body}
              </p>
              <Magnet
                as="a"
                href={OFFICIAL_URL}
                external
                skin="gold"
                reduced={reduced}
                className="mt-8 inline-flex"
                data-cursor="link"
              >
                {drinks.cta}
              </Magnet>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:gap-5">
              {drinks.arts.map((art, i) => (
                <figure
                  key={art}
                  data-reveal
                  style={{
                    '--d': i + 1,
                    transform: `translateY(${i === 1 ? '-8%' : '0'})`,
                  }}
                  className="group"
                >
                  <div className="frame frame--pill w-full" style={{ aspectRatio: '3 / 4' }}>
                    <Media
                      art={art}
                      photo={null}
                      alt=""
                      className="transition-transform duration-[1200ms] ease-[cubic-bezier(.16,1,.3,1)] group-hover:scale-[1.07]"
                    />
                  </div>
                  <figcaption className="mt-3 text-center text-[0.72rem] text-mist-soft">
                    {CAPTIONS[i]}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
