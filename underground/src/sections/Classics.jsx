import { classics, menu } from '../data/content.js'
import Media from '../components/Media.jsx'
import { Eyebrow, Words } from '../components/ui.jsx'
import { useTrack } from '../lib/hooks.js'

/* ═══════════════════════════════════════════════════════════════════
   THE UNDERGROUND CLASSICS

   Four dishes, printed large, alternating left and right down the page
   with each picture drifting against the scroll at its own rate.

   The picks are named in `classics.picks` and looked up in the menu, so
   a dish name exists in exactly one place. If a name is edited in the
   menu and not here, this section drops the card rather than rendering
   a dish that no longer exists — a missing card is a visible bug, a
   stale duplicate is an invisible one.
   ═══════════════════════════════════════════════════════════════════ */

const all = () => menu.categories.flatMap((c) => c.items)

export default function Classics({ reduced }) {
  const picks = classics.picks
    .map((name) => all().find((i) => i.name === name))
    .filter(Boolean)

  return (
    <section className="relative overflow-hidden py-[clamp(5rem,13vh,9rem)]">
      <div className="shell">
        <div className="max-w-[46rem]">
          <div data-reveal>
            <Eyebrow>{classics.eyebrow}</Eyebrow>
          </div>
          <h2 className="t-h1 mt-6" data-reveal-group>
            <Words text={classics.title} stagger={52} />
          </h2>
        </div>

        <div className="mt-[clamp(3rem,7vh,5rem)] flex flex-col gap-[clamp(3rem,8vh,6rem)]">
          {picks.map((dish, i) => (
            <Pick key={dish.name} dish={dish} index={i} reduced={reduced} />
          ))}
        </div>
      </div>
    </section>
  )
}

function Pick({ dish, index, reduced }) {
  const track = useTrack(reduced)
  const flip = index % 2 === 1

  return (
    <article
      ref={track}
      data-cursor="view"
      className={[
        'group grid items-center gap-8 lg:gap-16',
        'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]',
      ].join(' ')}
    >
      <div className={flip ? 'lg:order-2' : ''}>
        <div className="mask-reveal frame w-full" style={{ aspectRatio: '5 / 4' }}>
          <div className="mask-reveal__inner h-full w-full">
            <div
              className="h-full w-full will-change-transform"
              style={{ transform: 'translate3d(0, calc((var(--p, .5) - .5) * -7%), 0) scale(1.06)' }}
            >
              <Media
                art={dish.art}
                photo={dish.photo}
                alt={`${dish.name}${dish.photo ? '' : ' — drawn illustration'}`}
                className="transition-transform duration-[1300ms] ease-[cubic-bezier(.16,1,.3,1)] group-hover:scale-[1.06]"
              />
            </div>
          </div>
        </div>
      </div>

      <div className={flip ? 'lg:order-1 lg:pr-8' : 'lg:pl-8'}>
        <p className="t-label text-leaf" data-reveal>
          {String(index + 1).padStart(2, '0')}
        </p>
        <h3
          className="t-h2 mt-4"
          data-reveal
          style={{ '--d': 1 }}
        >
          {dish.name}
        </h3>
        {dish.desc && (
          <p className="t-lead mt-5 max-w-[44ch]" data-reveal style={{ '--d': 2 }}>
            {dish.desc}
          </p>
        )}
        <span
          aria-hidden="true"
          className="mt-8 block h-px w-24 origin-left bg-lime transition-transform duration-700 ease-[cubic-bezier(.16,1,.3,1)] group-hover:scale-x-[2]"
        />
      </div>
    </article>
  )
}
