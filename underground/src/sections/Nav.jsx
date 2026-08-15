import { useEffect, useState } from 'react'
import { nav, brand, OFFICIAL_URL } from '../data/content.js'
import { useScrollState, useActiveSection } from '../lib/hooks.js'
import { ArrowOut, Magnet } from '../components/ui.jsx'

/* ═══════════════════════════════════════════════════════════════════
   NAV

   Transparent over the hero, solid the moment the page moves. On a
   phone it is a full-height panel rather than a dropdown: six links at
   a size worth tapping, and the same two calls to action as the
   desktop bar, so nothing is only reachable on a laptop.
   ═══════════════════════════════════════════════════════════════════ */

const IDS = ['top', 'menu', 'about', 'gallery', 'location', 'contact']

export default function Nav({ reduced }) {
  const { past, up, y } = useScrollState()
  const active = useActiveSection(IDS)
  const [open, setOpen] = useState(false)

  // Escape closes the panel; while it is open the page underneath does
  // not scroll, which is the difference between a panel and a nuisance.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Hide the bar going down, bring it back the moment you scroll up.
  const hidden = past && !up && y > 480 && !open

  return (
    <>
      <a
        href="#menu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[120] focus:rounded-full focus:bg-cream focus:px-5 focus:py-3 focus:font-mono focus:text-xs focus:uppercase focus:tracking-widest focus:text-ground"
      >
        Skip to the menu
      </a>

      <header
        className={[
          'fixed inset-x-0 top-0 z-[92] transition-[transform,background-color,border-color,backdrop-filter] duration-700',
          'ease-[cubic-bezier(.16,1,.3,1)] border-b',
          past
            ? 'border-cream/10 bg-ground/85 backdrop-blur-xl'
            : 'border-transparent bg-transparent',
          hidden ? '-translate-y-full' : 'translate-y-0',
        ].join(' ')}
        style={{ height: 'var(--nav-h)' }}
      >
        <div className="shell flex h-full items-center justify-between gap-6">
          <a
            href="#top"
            data-cursor="link"
            className="group flex items-baseline gap-2.5 whitespace-nowrap"
            onClick={() => setOpen(false)}
          >
            <span className="font-display text-[1.35rem] leading-none tracking-[0.02em] text-cream sm:text-[1.5rem]">
              {brand.name}
            </span>
            <span className="hidden font-mono text-[0.6rem] tracking-[0.3em] text-dust transition-colors duration-500 group-hover:text-brass sm:inline">
              DUBAI
            </span>
          </a>

          <nav aria-label="Primary" className="hidden items-center gap-8 lg:flex">
            {nav.map((l) => {
              const id = l.href.slice(1)
              const on = active === id
              return (
                <a
                  key={l.href}
                  href={l.href}
                  data-cursor="link"
                  className="group relative py-2 font-mono text-[0.7rem] uppercase tracking-[0.2em] transition-colors duration-400"
                  style={{ color: on ? 'var(--color-cream)' : 'var(--color-dust)' }}
                >
                  {l.label}
                  <span
                    aria-hidden="true"
                    className={[
                      'absolute -bottom-0.5 left-0 h-px w-full bg-brass transition-transform duration-500',
                      'ease-[cubic-bezier(.16,1,.3,1)] origin-left',
                      on ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100',
                    ].join(' ')}
                  />
                </a>
              )
            })}
          </nav>

          <div className="flex items-center gap-2 sm:gap-4">
            <a
              href={OFFICIAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              data-cursor="link"
              className="group hidden items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-[0.2em] text-dust transition-colors duration-400 hover:text-cream xl:inline-flex"
            >
              undergroundcafe.ae
              <ArrowOut />
            </a>

            <Magnet
              as="a"
              href="#menu"
              skin="solid"
              reduced={reduced}
              className="hidden sm:inline-flex"
              data-cursor="link"
            >
              View Menu
            </Magnet>

            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? 'Close menu' : 'Open menu'}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-cream/20 lg:hidden"
            >
              <span className="relative block h-3 w-5">
                <span
                  className="absolute left-0 top-0 block h-px w-full bg-cream transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)]"
                  style={{ transform: open ? 'translateY(6px) rotate(45deg)' : 'none' }}
                />
                <span
                  className="absolute bottom-0 left-0 block h-px w-full bg-cream transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)]"
                  style={{ transform: open ? 'translateY(-6px) rotate(-45deg)' : 'none' }}
                />
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile panel */}
      <div
        id="mobile-nav"
        className={[
          'fixed inset-0 z-[85] lg:hidden',
          open ? 'pointer-events-auto' : 'pointer-events-none',
        ].join(' ')}
        aria-hidden={!open}
      >
        <div
          className="absolute inset-0 bg-ground/70 backdrop-blur-sm transition-opacity duration-500"
          style={{ opacity: open ? 1 : 0 }}
          onClick={() => setOpen(false)}
        />
        <div
          className="absolute inset-x-0 top-0 origin-top border-b border-cream/10 bg-basalt/98 px-[var(--gutter)] pb-10 pt-[calc(var(--nav-h)+1.5rem)] transition-transform duration-700 ease-[cubic-bezier(.76,0,.24,1)]"
          style={{ transform: open ? 'translateY(0)' : 'translateY(-102%)' }}
        >
          <nav aria-label="Primary, mobile">
            <ul>
              {nav.map((l, i) => (
                <li key={l.href} className="border-b border-cream/8 last:border-0">
                  <a
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="flex items-baseline justify-between py-4 font-display text-[2rem] leading-none text-cream transition-[opacity,transform] duration-500 ease-[cubic-bezier(.16,1,.3,1)]"
                    style={{
                      opacity: open ? 1 : 0,
                      transform: open ? 'none' : 'translateY(16px)',
                      transitionDelay: open ? `${120 + i * 55}ms` : '0ms',
                    }}
                  >
                    {l.label}
                    <span className="font-mono text-[0.6rem] tracking-[0.25em] text-dust">
                      0{i + 1}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div
            className="mt-8 flex flex-col gap-3 transition-opacity duration-500"
            style={{ opacity: open ? 1 : 0, transitionDelay: open ? '440ms' : '0ms' }}
          >
            <a
              href="#menu"
              onClick={() => setOpen(false)}
              className="flex min-h-13 items-center justify-center rounded-full bg-cream px-6 py-4 font-mono text-[0.72rem] uppercase tracking-[0.2em] text-ground"
            >
              View Menu
            </a>
            <a
              href={OFFICIAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex min-h-13 items-center justify-center gap-2 rounded-full border border-cream/25 px-6 py-4 font-mono text-[0.72rem] uppercase tracking-[0.2em] text-cream"
            >
              Official Site
              <ArrowOut />
            </a>
          </div>
        </div>
      </div>
    </>
  )
}
