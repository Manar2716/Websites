import { escape as copy } from '../data/content.js'
import Media from '../components/Media.jsx'
import { Words } from '../components/ui.jsx'
import { useTrack } from '../lib/hooks.js'

/* ═══════════════════════════════════════════════════════════════════
   A LITTLE ESCAPE

   The one section that is nothing but a picture and two lines of type.
   The greenery behind it drifts up as the band crosses the viewport and
   the two lines move at different rates, so the words separate from the
   foliage rather than sitting flat on it.
   ═══════════════════════════════════════════════════════════════════ */

export default function Escape({ reduced }) {
  const track = useTrack(reduced)

  return (
    <section
      ref={track}
      className="relative isolate flex min-h-[82svh] items-center overflow-hidden lg:min-h-[92svh]"
    >
      <div
        className="absolute inset-0 -z-20 will-change-transform"
        style={{ transform: 'translate3d(0, calc((var(--p, .5) - .5) * -9%), 0) scale(1.12)' }}
      >
        <Media art="escape" photo={null} alt="" />
      </div>

      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(80% 70% at 50% 50%, rgba(11,32,24,.62) 0%, rgba(11,32,24,.34) 55%, rgba(11,32,24,.62) 100%)',
        }}
      />

      <div className="shell relative w-full text-center">
        <h2
          className="mx-auto max-w-[16ch] font-display text-[clamp(2.6rem,1.1rem+8.4vw,8rem)] leading-[0.92] tracking-[-0.025em] text-canvas"
          style={{
            fontVariationSettings: "'SOFT' 70, 'WONK' 1, 'opsz' 144",
            transform: 'translate3d(0, calc((var(--p, .5) - .5) * -22%), 0)',
          }}
          data-reveal-group
        >
          <Words text={copy.line1} stagger={70} />
        </h2>
        <p
          className="mx-auto mt-4 max-w-[18ch] font-display text-[clamp(1.4rem,0.8rem+3vw,3.2rem)] leading-[1.05] text-lime"
          style={{
            fontVariationSettings: "'SOFT' 70, 'WONK' 1, 'opsz' 90",
            transform: 'translate3d(0, calc((var(--p, .5) - .5) * -8%), 0)',
          }}
          data-reveal-group
        >
          <Words text={copy.line2} delay={260} stagger={60} />
        </p>
        <p className="mx-auto mt-8 max-w-[42ch] text-[1rem] leading-relaxed text-canvas/80" data-reveal style={{ '--d': 4 }}>
          {copy.body}
        </p>
      </div>
    </section>
  )
}
