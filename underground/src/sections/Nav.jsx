import { useEffect, useState } from 'react'
import { nav, brand, OFFICIAL_URL } from '../data/content.js'
import { useScrollState, useActiveSection } from '../lib/hooks.js'
import { ArrowOut, Magnet, Sprig } from '../components/ui.jsx'

/* ═══════════════════════════════════════════════════════════════════
   NAV

   A floating glass bar rather than a full-width one: it sits inset from
   the edges with the page visible around it, which keeps the greenery
   running behind and under it instead of being cut off by a band.

   Over the hero it is barely there. Once the page moves it gains a
   solid cream ground and a shadow, because glass over a busy photograph
   is unreadable and glass over cream copy is worse.
   ═══════════════════════════════════════════════════════════════════ */

const IDS = ['top', 'menu', 'story', 'gallery', 'visit']

export default function Nav({ reduced }) {
  const { past, up, y } = useScrollState()
  const active = useActiveSection(IDS)
  const [open, setOpen] = useState(false)

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

  const hidden = past && !up && y > 520 && !open

  return (
    <>
      <a
        href="#menu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[120] focus:rounded-full focus:bg-deep focus:px-5 focus:py-3 focus:text-xs focus:font-semibold focus:uppercase focus:tracking-widest focus:text-canvas"
      >
        Skip to the menu
      </a>

      <header
        className={[
          'fixed inset-x-0 top-0 z-[92] transition-transform duration-700 ease-[cubic-bezier(.16,1,.3,1)]',
          hidden ? '-translate-y-[130%]' : 'translate-y-0',
        ].join(' ')}
      >
        <div className="shell pt-3 sm:pt-4">
          <div
            className={[
              'flex items-center justify-between gap-4 rounded-full border px-4 py-2.5 sm:px-5',
              'transition-[background-color,border-color,box-shadow,backdrop-filter] duration-700',
              past
                ? 'border-line bg-canvas/92 shadow-[0_18px_40px_-30px_rgba(18,48,36,.6)] backdrop-blur-xl'
                : 'border-canvas/25 bg-deep/30 backdrop-blur-md',
            ].join(' ')}
          >
            <a
              href="#top"
              data-cursor="link"
              className="group flex items-center gap-2 whitespace-nowrap"
              onClick={() => setOpen(false)}
            >
              <Sprig
                size={20}
                className={past ? 'text-leaf' : 'text-lime'}
              />
              <span
                className={[
                  'font-display text-[1.15rem] leading-none tracking-[0.01em] sm:text-[1.3rem]',
                  past ? 'text-ink' : 'text-canvas',
                ].join(' ')}
                style={{ fontVariationSettings: "'SOFT' 50, 'WONK' 1, 'opsz' 40" }}
              >
                {brand.name}
              </span>
            </a>

            <nav aria-label="Primary" className="hidden items-center gap-7 lg:flex">
              {nav.map((l) => {
                const id = l.href.slice(1)
                const on = active === id
                return (
                  <a
                    key={l.href}
                    href={l.href}
                    data-cursor="link"
                    className={[
                      'group relative py-1.5 text-[0.82rem] font-medium transition-colors duration-400',
                      past
                        ? on ? 'text-ink' : 'text-ink-soft hover:text-ink'
                        : on ? 'text-canvas' : 'text-canvas/85 hover:text-canvas',
                    ].join(' ')}
                  >
                    {l.label}
                    <span
                      aria-hidden="true"
                      className={[
                        'absolute -bottom-0.5 left-0 h-px w-full origin-left bg-lime transition-transform duration-500',
                        'ease-[cubic-bezier(.16,1,.3,1)]',
                        on ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100',
                      ].join(' ')}
                    />
                  </a>
                )
              })}
            </nav>

            <div className="flex items-center gap-2 sm:gap-3">
              <Magnet
                as="a"
                href="#menu"
                skin={past ? 'leaf' : 'gold'}
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
                className={[
                  'grid h-11 w-11 shrink-0 place-items-center rounded-full border lg:hidden',
                  past ? 'border-ink/20 text-ink' : 'border-canvas/40 text-canvas',
                ].join(' ')}
              >
                <span className="relative block h-3 w-5">
                  <span
                    className="absolute left-0 top-0 block h-px w-full bg-current transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)]"
                    style={{ transform: open ? 'translateY(6px) rotate(45deg)' : 'none' }}
                  />
                  <span
                    className="absolute bottom-0 left-0 block h-px w-full bg-current transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)]"
                    style={{ transform: open ? 'translateY(-6px) rotate(-45deg)' : 'none' }}
                  />
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile panel */}
      <div
        id="mobile-nav"
        className={['fixed inset-0 z-[85] lg:hidden', open ? 'pointer-events-auto' : 'pointer-events-none'].join(' ')}
        aria-hidden={!open}
      >
        <div
          className="absolute inset-0 bg-deep/60 backdrop-blur-sm transition-opacity duration-500"
          style={{ opacity: open ? 1 : 0 }}
          onClick={() => setOpen(false)}
        />
        <div
          className="absolute inset-x-0 top-0 origin-top rounded-b-[2.5rem] bg-canvas px-[var(--gutter)] pb-10 pt-[calc(var(--nav-h)+2rem)] shadow-[0_30px_60px_-30px_rgba(18,48,36,.5)] transition-transform duration-700 ease-[cubic-bezier(.76,0,.24,1)]"
          style={{ transform: open ? 'translateY(0)' : 'translateY(-102%)' }}
        >
          <nav aria-label="Primary, mobile">
            <ul>
              {nav.map((l, i) => (
                <li key={l.href} className="border-b border-line last:border-0">
                  <a
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="flex items-baseline justify-between py-4 font-display text-[1.9rem] leading-none text-ink transition-[opacity,transform] duration-500 ease-[cubic-bezier(.16,1,.3,1)]"
                    style={{
                      fontVariationSettings: "'SOFT' 50, 'WONK' 1, 'opsz' 60",
                      opacity: open ? 1 : 0,
                      transform: open ? 'none' : 'translateY(16px)',
                      transitionDelay: open ? `${120 + i * 55}ms` : '0ms',
                    }}
                  >
                    {l.label}
                    <Sprig size={15} className="text-lime" />
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div
            className="mt-8 flex flex-col gap-3 transition-opacity duration-500"
            style={{ opacity: open ? 1 : 0, transitionDelay: open ? '420ms' : '0ms' }}
          >
            <a
              href="#menu"
              onClick={() => setOpen(false)}
              className="flex min-h-13 items-center justify-center rounded-full bg-deep px-6 py-4 text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-canvas"
            >
              View Menu
            </a>
            <a
              href={OFFICIAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex min-h-13 items-center justify-center gap-2 rounded-full border border-ink/25 px-6 py-4 text-[0.75rem] font-semibold uppercase tracking-[0.16em] text-ink"
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
