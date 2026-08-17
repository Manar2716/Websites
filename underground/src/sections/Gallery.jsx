import { gallery } from '../data/content.js'
import Media from '../components/Media.jsx'
import { Eyebrow, Words } from '../components/ui.jsx'
import { useTrack } from '../lib/hooks.js'

/* ═══════════════════════════════════════════════════════════════════
   GALLERY

   Six pictures at three sizes on a twelve-column grid, in leaf-arch and
   pill frames rather than rectangles, each offset vertically from its
   neighbour so no two tops line up. Not a contact sheet: an Instagram
   grid is six identical squares, and six identical squares tell you
   nothing about which picture matters.

   Each drifts against the scroll at a rate set by its own size — the
   tall ones move most — which is what stops the block reading as one
   flat plane sliding past.
   ═══════════════════════════════════════════════════════════════════ */

const SHAPE = {
  wide: { cell: 'col-span-12 lg:col-span-7', ratio: '16 / 10', drift: 4, shape: 'frame--soft', off: '' },
  tall: { cell: 'col-span-12 sm:col-span-6 lg:col-span-5 lg:row-span-2', ratio: '4 / 5', drift: 9, shape: '', off: 'lg:mt-10' },
  std: { cell: 'col-span-12 sm:col-span-6 lg:col-span-4', ratio: '1 / 1', drift: 6, shape: 'frame--pill', off: 'lg:mt-6' },
}

export default function Gallery({ reduced }) {
  return (
    <section id="gallery" className="relative scroll-mt-20 py-[clamp(5rem,13vh,9rem)]">
      <div className="shell">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
          <div>
            <div data-reveal>
              <Eyebrow>{gallery.eyebrow}</Eyebrow>
            </div>
            <h2 className="t-h1 mt-6 max-w-[15ch]" data-reveal-group>
              <Words text={gallery.title} stagger={52} />
            </h2>
          </div>
          <p className="max-w-[34ch] text-[0.88rem] leading-relaxed text-ink-soft" data-reveal style={{ '--d': 2 }}>
            {gallery.note}
          </p>
        </div>

        <div className="mt-12 grid grid-cols-12 gap-4 sm:mt-16 sm:gap-6">
          {gallery.shots.map((shot, i) => (
            <Shot key={shot.art} shot={shot} index={i} reduced={reduced} />
          ))}
        </div>
      </div>
    </section>
  )
}

function Shot({ shot, index, reduced }) {
  const track = useTrack(reduced)
  const shape = SHAPE[shot.span] ?? SHAPE.std

  return (
    <figure ref={track} className={`${shape.cell} ${shape.off} group relative`} data-cursor="view">
      <div className={`mask-reveal frame ${shape.shape} w-full`} style={{ aspectRatio: shape.ratio }}>
        <div className="mask-reveal__inner h-full w-full">
          <div
            className="h-full w-full will-change-transform"
            style={{ transform: `translate3d(0, calc((var(--p, .5) - .5) * -${shape.drift}%), 0) scale(1.07)` }}
          >
            <Media
              art={shot.art}
              photo={shot.photo}
              alt={shot.caption}
              className="transition-transform duration-[1300ms] ease-[cubic-bezier(.16,1,.3,1)] group-hover:scale-[1.07]"
            />
          </div>
        </div>

        {/* The caption plate rises out of the bottom edge on hover, and
            sits open on touch, where there is nothing to hover with. */}
        <figcaption
          className={[
            'pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 sm:p-6',
            'translate-y-0 opacity-100 transition-[transform,opacity] duration-[800ms] ease-[cubic-bezier(.16,1,.3,1)]',
            'fine:translate-y-3 fine:opacity-0',
            'fine:group-hover:translate-y-0 fine:group-hover:opacity-100',
          ].join(' ')}
          style={{
            background:
              'linear-gradient(0deg, rgba(11,32,24,.86) 0%, rgba(11,32,24,.4) 55%, transparent 100%)',
          }}
        >
          <span className="max-w-[24ch] text-[0.84rem] leading-snug text-canvas">{shot.caption}</span>
          <span className="t-label shrink-0 text-[0.6rem] text-lime">
            {String(index + 1).padStart(2, '0')}
          </span>
        </figcaption>
      </div>
    </figure>
  )
}
