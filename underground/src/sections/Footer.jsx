import { brand, business, footer, nav, OFFICIAL_URL } from '../data/content.js'
import { Underline, Sprig } from '../components/ui.jsx'
import Media from '../components/Media.jsx'

/* ═══════════════════════════════════════════════════════════════════
   FOOTER

   Deep forest green, a wordmark set as large as the page will allow,
   and a band of drawn foliage across the top edge so the section grows
   out of the page rather than being bolted to the bottom of it.

   The colophon is not decoration. This is a concept site for a real
   business, and the last thing on the page says so plainly — including
   that no prices are shown.
   ═══════════════════════════════════════════════════════════════════ */

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="on-deep relative overflow-hidden">
      {/* Foliage growing over the top edge */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-70 sm:h-40" aria-hidden="true">
        <Media art="gal-leaves" photo={null} alt="" />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, transparent 10%, var(--color-deep) 92%)' }}
        />
      </div>

      <div className="shell relative pb-12 pt-[clamp(6rem,14vh,10rem)]">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1.1fr] lg:gap-12">
          <div>
            <div className="flex items-center gap-2.5">
              <Sprig size={22} className="text-lime" />
              <p className="t-label text-lime">{brand.sub}</p>
            </div>
            <p className="mt-4 max-w-[30ch] text-[0.88rem] leading-relaxed text-mist-soft">
              {brand.tagline}
            </p>
            <p className="mt-5 text-[0.84rem] leading-relaxed text-mist-soft">
              {business.address.line1}
              <br />
              {business.address.line2}
              <br />
              {business.address.line3}
            </p>
          </div>

          <nav aria-label="Footer">
            <p className="t-label text-[0.6rem] text-mist-soft">Explore</p>
            <ul className="mt-5 space-y-3">
              {nav.map((l) => (
                <li key={l.href}>
                  <Underline href={l.href} className="text-[0.92rem] text-mist hover:text-canvas">
                    {l.label}
                  </Underline>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <p className="t-label text-[0.6rem] text-mist-soft">Opening hours</p>
            <ul className="mt-5 space-y-3">
              {business.hours.rows.map((r) => (
                <li key={r.days} className="text-[0.88rem] leading-snug text-mist">
                  {r.days}
                  <span className="mt-0.5 block font-medium tabular-nums text-canvas">{r.time}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="t-label text-[0.6rem] text-mist-soft">Find us</p>
            <ul className="mt-5 space-y-3">
              <li>
                <Underline href={`tel:${business.phone.tel}`} className="text-[0.92rem] text-mist hover:text-canvas">
                  {business.phone.display}
                </Underline>
              </li>
              {business.social.map((s) => (
                <li key={s.label}>
                  <Underline href={s.href} external className="text-[0.92rem] text-mist hover:text-canvas">
                    {s.handle}
                  </Underline>
                </li>
              ))}
              <li>
                <Underline href={OFFICIAL_URL} external className="text-[0.92rem] text-mist hover:text-canvas">
                  undergroundcafe.ae
                </Underline>
              </li>
              <li>
                <Underline href={business.maps} external className="text-[0.92rem] text-mist hover:text-canvas">
                  Find us on the map
                </Underline>
              </li>
            </ul>
          </div>
        </div>

        {/* The wordmark, as wide as the page allows */}
        <p
          className="mt-16 w-full select-none text-center font-display leading-[0.8] tracking-[-0.02em] text-canvas/90"
          style={{ fontSize: 'min(19vw, 15rem)', fontVariationSettings: "'SOFT' 70, 'WONK' 1, 'opsz' 144" }}
          aria-hidden="true"
        >
          {brand.name}
        </p>
        <p className="sr-only">{brand.full}</p>

        <div className="mt-10 flex flex-col gap-6 border-t border-line-deep pt-8 lg:flex-row lg:items-start lg:justify-between">
          <p className="max-w-[62ch] text-[0.76rem] leading-relaxed text-mist-soft">{footer.colophon}</p>
          <p className="shrink-0 text-[0.76rem] uppercase tracking-[0.16em] text-mist-soft">
            {brand.strap} &middot; &copy; {year}
          </p>
        </div>
      </div>
    </footer>
  )
}
