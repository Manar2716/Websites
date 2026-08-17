import { contact, business, OFFICIAL_URL } from '../data/content.js'
import { Magnet, Words, Sprig } from '../components/ui.jsx'
import { useTrack } from '../lib/hooks.js'

/* The ask. Four ways to act on it, in the order somebody standing in
   Dubai at half past eleven at night would want them. */
export default function Contact({ reduced }) {
  const track = useTrack(reduced)

  return (
    <section
      id="contact"
      ref={track}
      className="relative scroll-mt-20 overflow-hidden py-[clamp(5.5rem,15vh,10rem)]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: 'radial-gradient(58% 54% at 50% 44%, rgba(157,196,75,.2), transparent 72%)',
          transform: 'translate3d(0, calc((var(--p, .5) - .5) * -16%), 0)',
        }}
      />

      <div className="shell text-center">
        <Sprig size={30} className="mx-auto text-lime" />
        <h2 className="t-h1 mx-auto mt-6 max-w-[16ch]" data-reveal-group>
          <Words text={contact.title} stagger={62} />
        </h2>

        <p className="mt-6 text-[0.95rem] text-ink-soft" data-reveal style={{ '--d': 3 }}>
          {contact.line}
        </p>

        <div
          className="mt-11 flex flex-wrap items-center justify-center gap-3 sm:gap-4"
          data-reveal
          style={{ '--d': 4 }}
        >
          <Magnet as="a" href={`tel:${business.phone.tel}`} skin="leaf" reduced={reduced} data-cursor="link">
            Call Us
          </Magnet>
          <Magnet as="a" href={business.directions} external skin="ghost" arrow reduced={reduced} data-cursor="link">
            Get Directions
          </Magnet>
          <Magnet as="a" href="#menu" skin="ghost" reduced={reduced} data-cursor="link">
            View Menu
          </Magnet>
          <Magnet as="a" href={OFFICIAL_URL} external skin="gold" reduced={reduced} data-cursor="link">
            Visit Official Website
          </Magnet>
        </div>
      </div>
    </section>
  )
}
