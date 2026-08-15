import { useState } from 'react'
import { menu, OFFICIAL_URL, business } from '../data/content.js'
import Media from '../components/Media.jsx'
import { Eyebrow, Magnet, Words, Underline } from '../components/ui.jsx'
import { usePointerIn } from '../lib/hooks.js'

/* ═══════════════════════════════════════════════════════════════════
   MENU

   Not a grid of equal boxes. The first item in every category is
   printed twice the size of the others and holds the left of the
   frame; the rest fall in beside it on a stagger, so the block has a
   top-left weight and a diagonal through it rather than a flat wall.

   Two things about what is *in* it.

   There are no prices. Not one price for any item here could be
   sourced, and a concept site carrying invented numbers is the version
   of this that does real damage — somebody quotes it back at the
   counter. Names and descriptions are shown; prices live on the
   official site, one tap away.

   Items that come from Underground's own delivery listings carry a
   brass dot. Everything else is a layout placeholder and does not.
   The legend sits at the top of the list, before anybody reads a
   single dish.
   ═══════════════════════════════════════════════════════════════════ */

export default function Menu({ reduced }) {
  const [active, setActive] = useState(menu.categories[0].id)
  const cat = menu.categories.find((c) => c.id === active) ?? menu.categories[0]

  return (
    <section id="menu" className="relative scroll-mt-20 py-[clamp(5rem,13vh,9rem)]">
      <div className="shell">
        {/* Header */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
          <div>
            <div data-reveal>
              <Eyebrow>{menu.eyebrow}</Eyebrow>
            </div>
            <h2 className="t-h1 mt-6 max-w-[15ch]" data-reveal-group>
              <Words text={menu.title} stagger={54} />
            </h2>
          </div>

          <div className="lg:max-w-[27rem] lg:text-right" data-reveal style={{ '--d': 2 }}>
            <p className="text-[0.9rem] leading-relaxed text-dust">{menu.note}</p>
            <Magnet
              as="a"
              href={OFFICIAL_URL}
              external
              skin="brass"
              reduced={reduced}
              className="mt-5 inline-flex"
              data-cursor="link"
            >
              {menu.cta}
            </Magnet>
          </div>
        </div>

        {/* Categories */}
        <div
          className="mt-10 -mx-[var(--gutter)] overflow-x-auto px-[var(--gutter)] pb-1 sm:mt-14 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          data-reveal
          style={{ '--d': 1 }}
        >
          <div
            role="tablist"
            aria-label="Menu categories"
            className="flex w-max items-center gap-2 border-b border-cream/10 pb-0"
          >
            {menu.categories.map((c) => {
              const on = c.id === active
              return (
                <button
                  key={c.id}
                  role="tab"
                  type="button"
                  aria-selected={on}
                  aria-controls={`panel-${c.id}`}
                  id={`tab-${c.id}`}
                  onClick={() => setActive(c.id)}
                  data-cursor="link"
                  className="group relative px-4 py-4 first:pl-0 sm:px-6"
                >
                  <span
                    className="font-display text-[clamp(1.15rem,1rem+0.7vw,1.6rem)] leading-none transition-colors duration-500"
                    style={{ color: on ? 'var(--color-cream)' : 'var(--color-dust)' }}
                  >
                    {c.label}
                  </span>
                  <span className="ml-2 align-super font-mono text-[0.58rem] text-brass/70">
                    {String(c.items.length).padStart(2, '0')}
                  </span>
                  <span
                    aria-hidden="true"
                    className={[
                      'absolute -bottom-px left-0 h-px w-full origin-left bg-brass transition-transform',
                      'duration-600 ease-[cubic-bezier(.16,1,.3,1)]',
                      on ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-50',
                    ].join(' ')}
                  />
                </button>
              )
            })}
          </div>
        </div>

        <div
          id={`panel-${cat.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${cat.id}`}
          className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-10"
          key={`cap-${cat.id}`}
          data-reveal
        >
          <p className="max-w-[52ch] text-[0.95rem] leading-relaxed text-bone">{cat.caption}</p>
          <p className="flex shrink-0 items-center gap-2.5 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-dust">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brass" aria-hidden="true" />
            {menu.legend}
          </p>
        </div>

        {/* Items */}
        <div
          key={cat.id}
          className="mt-10 grid gap-x-6 gap-y-12 sm:mt-14 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-8"
        >
          {cat.items.map((item, i) => (
            <Item key={item.name} item={item} index={i} feature={i === 0} reduced={reduced} />
          ))}
        </div>

        {/* Where the prices actually are */}
        <p
          className="mt-14 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-cream/10 pt-7 text-[0.85rem] text-dust"
          data-reveal
        >
          <span>Prices and the full list are on the official site.</span>
          <Underline href={OFFICIAL_URL} external className="text-bone hover:text-cream">
            undergroundcafe.ae
          </Underline>
          {business.order.map((o) => (
            <Underline key={o.label} href={o.href} external className="text-bone hover:text-cream">
              Order on {o.label}
            </Underline>
          ))}
        </p>
      </div>
    </section>
  )
}

function Item({ item, index, feature, reduced }) {
  const tilt = usePointerIn(reduced)
  const sourced = item.source === 'listed'

  return (
    <article
      ref={tilt}
      data-reveal
      data-cursor="link"
      style={{ '--d': index, '--mx': 0, '--my': 0 }}
      className={[
        'group relative',
        feature ? 'sm:col-span-2 lg:col-span-2 lg:row-span-2' : '',
        // The stagger that stops the block reading as a wall
        !feature && index % 3 === 2 ? 'lg:mt-14' : '',
        !feature && index % 3 === 1 ? 'lg:mt-6' : '',
      ].join(' ')}
    >
      <div
        className="frame relative w-full will-change-transform"
        style={{
          aspectRatio: feature ? '16 / 11' : '4 / 3',
          transform: reduced
            ? undefined
            : 'perspective(900px) rotateX(calc(var(--my) * -2.4deg)) rotateY(calc(var(--mx) * 3.2deg))',
          transition: 'transform .7s cubic-bezier(.16,1,.3,1)',
        }}
      >
        <Media
          art={item.art}
          photo={item.photo}
          alt={`${item.name}${item.photo ? '' : ' — drawn illustration'}`}
          className="transition-transform duration-[1100ms] ease-[cubic-bezier(.16,1,.3,1)] group-hover:scale-[1.05]"
        />
        <span className="pointer-events-none absolute left-4 top-4 font-mono text-[0.6rem] tracking-[0.28em] text-cream/70">
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>

      <div className="mt-5 flex items-baseline gap-3">
        {sourced && (
          <span
            className="mb-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brass"
            title="From Underground’s own delivery listings"
            aria-hidden="true"
          />
        )}
        <h3
          className={[
            'font-display leading-none text-cream',
            feature
              ? 'text-[clamp(1.5rem,1.2rem+1.4vw,2.3rem)]'
              : 'text-[clamp(1.2rem,1.08rem+0.5vw,1.45rem)]',
          ].join(' ')}
        >
          {item.name}
          {sourced && <span className="sr-only"> (from Underground’s listings)</span>}
        </h3>
        <span
          aria-hidden="true"
          className="mb-1 h-px flex-1 bg-cream/15"
        />
      </div>

      <p
        className={[
          'mt-2.5 leading-relaxed text-dust',
          feature ? 'max-w-[48ch] text-[1rem]' : 'max-w-[38ch] text-[0.88rem]',
        ].join(' ')}
      >
        {item.desc}
      </p>
    </article>
  )
}
