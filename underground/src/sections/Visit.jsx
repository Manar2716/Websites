import { business, visit, OFFICIAL_URL } from '../data/content.js'
import Media from '../components/Media.jsx'
import { Eyebrow, Magnet, Underline, Words, ArrowOut } from '../components/ui.jsx'

/* ═══════════════════════════════════════════════════════════════════
   VISIT US

   A drawn plan instead of an embedded map. A provider iframe is a
   bright rectangle with somebody else's typography in it, and on a page
   built this carefully it lands like a hole. The drawing holds the
   layout; the buttons under it open the real map, which is where
   anybody actually navigating from this page ends up anyway.
   ═══════════════════════════════════════════════════════════════════ */

export default function Visit({ reduced }) {
  return (
    <section id="visit" className="relative scroll-mt-20 bg-panel py-[clamp(5rem,13vh,9rem)]">
      <div className="shell">
        <div className="grid gap-[clamp(2.5rem,6vw,4.5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center">
          <div>
            <div data-reveal>
              <Eyebrow>{visit.eyebrow}</Eyebrow>
            </div>

            <h2 className="t-h1 mt-6" data-reveal-group>
              <Words text={visit.title} stagger={60} />
            </h2>

            <p className="t-lead mt-6 max-w-[46ch]" data-reveal style={{ '--d': 2 }}>
              {visit.body}
            </p>

            <dl className="mt-10 grid gap-8 sm:grid-cols-2">
              <Block label="Address" d={3}>
                <address className="not-italic leading-relaxed text-ink">
                  {business.address.line1}
                  <br />
                  {business.address.line2}
                  <br />
                  {business.address.line3}
                </address>
              </Block>

              <Block label="Opening hours" d={4}>
                <ul className="space-y-1.5 text-ink">
                  {business.hours.rows.map((r) => (
                    <li key={r.days} className="flex flex-wrap justify-between gap-x-4">
                      <span className="text-ink-soft">{r.days}</span>
                      <span className="font-medium tabular-nums">{r.time}</span>
                    </li>
                  ))}
                </ul>
              </Block>

              <Block label="Phone" d={5}>
                <Underline href={`tel:${business.phone.tel}`} className="text-ink hover:text-leaf">
                  {business.phone.display}
                </Underline>
              </Block>

              <Block label="Online" d={6}>
                <div className="flex flex-col items-start gap-2">
                  <Underline href={OFFICIAL_URL} external className="text-ink hover:text-leaf">
                    undergroundcafe.ae
                  </Underline>
                  {business.social.map((s) => (
                    <Underline key={s.label} href={s.href} external className="text-ink hover:text-leaf">
                      {s.handle}
                    </Underline>
                  ))}
                </div>
              </Block>
            </dl>

            <div className="mt-10 flex flex-wrap gap-3 sm:gap-4" data-reveal style={{ '--d': 7 }}>
              <Magnet as="a" href={business.directions} external skin="leaf" arrow reduced={reduced} data-cursor="link">
                Get Directions
              </Magnet>
              <Magnet as="a" href={business.maps} external skin="ghost" reduced={reduced} data-cursor="link">
                Open in Maps
              </Magnet>
            </div>
          </div>

          <div className="relative" data-reveal style={{ '--d': 2 }}>
            <div className="frame frame--soft relative aspect-[4/5] w-full sm:aspect-[5/4] lg:aspect-[4/5]">
              <Media art="map" photo={null} alt="Illustrated plan of the block, with the restaurant marked at its centre" />

              <div className="absolute inset-x-4 bottom-4 sm:inset-x-6 sm:bottom-6">
                <div className="card flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <p className="t-label text-[0.6rem] text-leaf">Underground Cafe</p>
                    <p className="mt-1.5 text-[0.88rem] text-ink">
                      {business.address.line1} &middot; {business.address.line3}
                    </p>
                  </div>
                  <a
                    href={business.maps}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-cursor="link"
                    className="group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-ink/20 px-4 py-2.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ink transition-colors duration-500 hover:border-leaf hover:text-leaf"
                  >
                    Maps
                    <ArrowOut />
                  </a>
                </div>
              </div>

              <p className="t-label pointer-events-none absolute right-5 top-5 text-[0.58rem] text-leaf">
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
      <dt className="t-label text-[0.6rem] text-leaf">{label}</dt>
      <dd className="mt-3 text-[0.95rem]">{children}</dd>
    </div>
  )
}
