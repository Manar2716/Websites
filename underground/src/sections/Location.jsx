import { business, location, OFFICIAL_URL } from '../data/content.js'
import Painting from '../components/Painting.jsx'
import { Eyebrow, Magnet, Underline, Words, ArrowOut } from '../components/ui.jsx'

/* ═══════════════════════════════════════════════════════════════════
   LOCATION

   A drawn plan instead of an embedded map. An iframe from a map
   provider is a bright rectangle with somebody else's typography in
   it, and on a page this dark it reads as a hole rather than a
   section. The drawing holds the layout; the two buttons under it go
   to the real thing, which is where anybody actually navigating from
   this page is going to end up anyway.
   ═══════════════════════════════════════════════════════════════════ */

export default function Location({ reduced }) {
  return (
    <section id="location" className="relative scroll-mt-20 py-[clamp(5rem,13vh,9rem)]">
      <div className="shell">
        <div className="grid gap-[clamp(2.5rem,6vw,4.5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center">
          {/* Words */}
          <div>
            <div data-reveal>
              <Eyebrow>{location.eyebrow}</Eyebrow>
            </div>

            <h2 className="t-h1 mt-6" data-reveal-group>
              <Words text={location.title} stagger={60} />
            </h2>

            <p className="t-lead mt-6 max-w-[46ch]" data-reveal style={{ '--d': 2 }}>
              {location.body}
            </p>

            <dl className="mt-10 grid gap-8 sm:grid-cols-2">
              <Block label="Address" d={3}>
                <address className="not-italic leading-relaxed text-cream">
                  {business.address.line1}
                  <br />
                  {business.address.line2}
                  <br />
                  <span className="text-dust">{business.address.line3}</span>
                </address>
              </Block>

              <Block label="Hours" d={4}>
                <ul className="space-y-1.5 text-cream">
                  {business.hours.rows.map((r) => (
                    <li key={r.days} className="flex flex-wrap justify-between gap-x-4">
                      <span className="text-dust">{r.days}</span>
                      <span className="font-mono text-[0.82rem] tracking-wide">{r.time}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[0.8rem] text-dust">
                  Dine in, or order through{' '}
                  {business.order.map((o, i) => (
                    <span key={o.label}>
                      {i > 0 && ' and '}
                      <Underline href={o.href} external className="text-bone hover:text-cream">
                        {o.label}
                      </Underline>
                    </span>
                  ))}
                  .
                </p>
              </Block>

              <Block label="Phone" d={5}>
                <Underline href={`tel:${business.phone.tel}`} className="text-cream">
                  {business.phone.display}
                </Underline>
              </Block>

              <Block label="Online" d={6}>
                <div className="flex flex-col items-start gap-2">
                  <Underline href={OFFICIAL_URL} external className="text-cream">
                    undergroundcafe.ae
                  </Underline>
                  {business.social
                    .filter((s) => s.label === 'Instagram')
                    .map((s) => (
                      <Underline key={s.label} href={s.href} external className="text-cream">
                        {s.handle}
                      </Underline>
                    ))}
                </div>
              </Block>
            </dl>

            <div className="mt-10 flex flex-wrap gap-3 sm:gap-4" data-reveal style={{ '--d': 7 }}>
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
                href={business.maps}
                external
                skin="ghost"
                reduced={reduced}
                data-cursor="link"
              >
                Open in Maps
              </Magnet>
            </div>
          </div>

          {/* The plan */}
          <div className="relative" data-reveal style={{ '--d': 2 }}>
            <div className="frame relative aspect-[4/5] w-full sm:aspect-[5/4] lg:aspect-[4/5]">
              <Painting
                id="map"
                className="h-full w-full"
                style={{ height: '100%' }}
                alt="Stylised plan of the block, with the cafe marked at its centre"
              />

              {/* Plate over the plan, bottom left */}
              <div className="absolute inset-x-4 bottom-4 sm:inset-x-6 sm:bottom-6">
                <div className="card flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <p className="font-mono text-[0.6rem] uppercase tracking-[0.28em] text-brass">
                      Underground Cafe
                    </p>
                    <p className="mt-1.5 text-[0.88rem] text-cream">
                      {business.address.line1} &middot; {business.address.line2}
                    </p>
                  </div>
                  <a
                    href={business.maps}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-cursor="link"
                    className="group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-cream/20 px-4 py-2.5 font-mono text-[0.62rem] uppercase tracking-[0.2em] text-cream transition-colors duration-500 hover:border-brass hover:text-brass"
                  >
                    Maps
                    <ArrowOut />
                  </a>
                </div>
              </div>

              {/* Coordinate ticks, top right */}
              <p className="pointer-events-none absolute right-4 top-4 font-mono text-[0.58rem] uppercase tracking-[0.24em] text-dust sm:right-6 sm:top-6">
                Majan &middot; Dubai
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Block({ label, children, d }) {
  return (
    <div data-reveal style={{ '--d': d }}>
      <dt className="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-brass">{label}</dt>
      <dd className="mt-3 text-[0.95rem]">{children}</dd>
    </div>
  )
}
