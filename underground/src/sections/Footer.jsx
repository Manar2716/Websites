import { brand, business, footer, nav, OFFICIAL_URL } from '../data/content.js'
import { Underline } from '../components/ui.jsx'

/* ═══════════════════════════════════════════════════════════════════
   FOOTER

   Four columns, one wordmark, and a hairline that travels across the
   whole width on a slow loop — the only thing on the page that moves
   without being asked to, which is why it is one pixel tall and takes
   twelve seconds to cross.

   The colophon is not decoration. This is a concept site for a real
   business, and the last thing on the page says so plainly.
   ═══════════════════════════════════════════════════════════════════ */

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="relative overflow-hidden border-t border-cream/10 bg-basalt">
      {/* The travelling line */}
      <div className="relative h-px w-full overflow-hidden" aria-hidden="true">
        <span
          className="absolute inset-y-0 left-0 block w-[26%] animate-[travel_12s_ease-in-out_infinite]"
          style={{
            background:
              'linear-gradient(90deg, transparent, var(--color-brass), transparent)',
          }}
        />
      </div>

      <div className="shell py-[clamp(3.5rem,9vh,6rem)]">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.1fr] lg:gap-12">
          {/* Wordmark */}
          <div>
            <p className="font-display text-[clamp(1.8rem,1.5rem+1.2vw,2.6rem)] leading-[0.95] text-cream">
              UNDERGROUND
            </p>
            <p className="mt-3.5 font-mono text-[0.62rem] uppercase tracking-[0.32em] text-brass">
              Cafe &middot; Dubai
            </p>
            <p className="mt-6 max-w-[34ch] text-[0.84rem] leading-relaxed text-dust">
              {brand.tagline} {business.address.line1}, {business.address.line2}.
            </p>
          </div>

          {/* Nav */}
          <nav aria-label="Footer">
            <p className="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-dust">
              Explore
            </p>
            <ul className="mt-5 space-y-3">
              {nav.map((l) => (
                <li key={l.href}>
                  <Underline href={l.href} className="text-[0.92rem] text-bone hover:text-cream">
                    {l.label}
                  </Underline>
                </li>
              ))}
            </ul>
          </nav>

          {/* Hours */}
          <div>
            <p className="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-dust">Hours</p>
            <ul className="mt-5 space-y-3">
              {business.hours.rows.map((r) => (
                <li key={r.days} className="text-[0.88rem] leading-snug text-bone">
                  {r.days}
                  <span className="mt-0.5 block font-mono text-[0.78rem] tracking-wide text-cream">
                    {r.time}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <p className="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-dust">Contact</p>
            <ul className="mt-5 space-y-3">
              <li>
                <Underline href={`tel:${business.phone.tel}`} className="text-[0.92rem] text-bone hover:text-cream">
                  {business.phone.display}
                </Underline>
              </li>
              {business.social.map((s) => (
                <li key={s.label}>
                  <Underline
                    href={s.href}
                    external
                    className="text-[0.92rem] text-bone hover:text-cream"
                  >
                    {s.handle}
                  </Underline>
                </li>
              ))}
              <li>
                <Underline
                  href={business.maps}
                  external
                  className="text-[0.92rem] text-bone hover:text-cream"
                >
                  Find us on the map
                </Underline>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-6 border-t border-cream/10 pt-8 lg:flex-row lg:items-start lg:justify-between">
          <p className="max-w-[62ch] text-[0.76rem] leading-relaxed text-dust">
            {footer.colophon}
          </p>
          <p className="shrink-0 font-mono text-[0.66rem] uppercase tracking-[0.2em] text-dust">
            &copy; {year} Underground Cafe &middot;{' '}
            <a
              href={OFFICIAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-bone underline-offset-4 transition-colors duration-500 hover:text-brass"
            >
              undergroundcafe.ae
            </a>
          </p>
        </div>
      </div>

      <style>{`
        @keyframes travel {
          0%   { transform: translateX(-110%) }
          50%  { transform: translateX(400%) }
          100% { transform: translateX(-110%) }
        }
      `}</style>
    </footer>
  )
}
