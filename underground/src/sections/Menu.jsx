import { useState } from 'react'
import { menu, OFFICIAL_URL, business } from '../data/content.js'
import Media from '../components/Media.jsx'
import { Eyebrow, Magnet, Words, Underline, Sprig } from '../components/ui.jsx'
import { usePointerIn } from '../lib/hooks.js'

/* ═══════════════════════════════════════════════════════════════════
   MENU

   Categories run as a scrollable rail of pills; switching one remounts
   the list under a new key, which is what replays the stagger — the
   reveal observer picks the new nodes up through a MutationObserver and
   lets them in one after another.

   Two things about what is in it.

   Item names are real. Descriptions appear only where one could be
   sourced; the rest are left empty rather than written, because a
   description is a claim about what is on the plate.

   There are no prices. undergroundcafe.ae is unreachable from the
   machine this was built on and no price could be sourced anywhere
   else, so rather than guess, every item carries an empty price slot
   that the layout already has a column for. The note says so above the
   list, before anybody reads a single dish.
   ═══════════════════════════════════════════════════════════════════ */

export default function Menu({ reduced }) {
  const [active, setActive] = useState(menu.categories[0].id)
  const cat = menu.categories.find((c) => c.id === active) ?? menu.categories[0]

  return (
    <section id="menu" className="relative scroll-mt-20 bg-panel py-[clamp(5rem,13vh,9rem)]">
      <div className="shell">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
          <div>
            <div data-reveal>
              <Eyebrow>{menu.eyebrow}</Eyebrow>
            </div>
            <h2 className="t-h1 mt-6 max-w-[14ch]" data-reveal-group>
              <Words text={menu.title} stagger={54} />
            </h2>
          </div>

          <div className="lg:max-w-[26rem] lg:text-right" data-reveal style={{ '--d': 2 }}>
            <p className="text-[0.92rem] leading-relaxed text-ink-soft">{menu.note}</p>
            <Magnet
              as="a"
              href={OFFICIAL_URL}
              external
              skin="gold"
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
          className="mt-10 -mx-[var(--gutter)] overflow-x-auto px-[var(--gutter)] pb-2 sm:mt-14 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          data-reveal
          style={{ '--d': 1 }}
        >
          <div role="tablist" aria-label="Menu categories" className="flex w-max items-center gap-2.5">
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
                  className={[
                    'rounded-full border px-5 py-3 text-[0.85rem] font-medium transition-all duration-500',
                    'ease-[cubic-bezier(.16,1,.3,1)]',
                    on
                      ? 'border-deep bg-deep text-canvas'
                      : 'border-line bg-canvas text-ink-soft hover:border-leaf hover:text-ink',
                  ].join(' ')}
                >
                  {c.label}
                  <span className={on ? 'ml-2 text-lime' : 'ml-2 text-ink-soft/60'}>
                    {String(c.items.length).padStart(2, '0')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <p
          id={`panel-${cat.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${cat.id}`}
          className="mt-7 max-w-[56ch] text-[0.98rem] leading-relaxed text-ink-soft"
          key={`cap-${cat.id}`}
          data-reveal
        >
          {cat.caption}
        </p>

        <div
          key={cat.id}
          className="mt-10 grid gap-x-6 gap-y-12 sm:mt-14 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-8"
        >
          {cat.items.map((item, i) => (
            <Item key={item.name} item={item} index={i} feature={i === 0} reduced={reduced} />
          ))}
        </div>

        <div
          className="mt-14 flex flex-col gap-4 border-t border-line pt-8 text-[0.88rem] text-ink-soft sm:flex-row sm:items-center sm:justify-between"
          data-reveal
        >
          <p className="max-w-[46ch]">{menu.fullList}</p>
          <p className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Underline href={OFFICIAL_URL} external className="font-medium text-ink hover:text-leaf">
              Full menu &amp; prices
            </Underline>
            {business.order.map((o) => (
              <Underline key={o.label} href={o.href} external className="hover:text-leaf">
                {o.label}
              </Underline>
            ))}
          </p>
        </div>
      </div>
    </section>
  )
}

function Item({ item, index, feature, reduced }) {
  const tilt = usePointerIn(reduced)

  return (
    <article
      ref={tilt}
      data-reveal
      data-cursor="link"
      style={{ '--d': index, '--mx': 0, '--my': 0 }}
      className={[
        'group relative',
        feature ? 'sm:col-span-2 lg:col-span-2 lg:row-span-2' : '',
        !feature && index % 3 === 2 ? 'lg:mt-12' : '',
        !feature && index % 3 === 1 ? 'lg:mt-5' : '',
      ].join(' ')}
    >
      <div
        className={[
          'frame relative w-full will-change-transform',
          feature ? '' : 'frame--soft',
        ].join(' ')}
        style={{
          aspectRatio: feature ? '5 / 4' : '4 / 3',
          transform: reduced
            ? undefined
            : 'perspective(900px) rotateX(calc(var(--my) * -2.2deg)) rotateY(calc(var(--mx) * 3deg))',
          transition: 'transform .7s cubic-bezier(.16,1,.3,1)',
        }}
      >
        <Media
          art={item.art}
          photo={item.photo}
          alt={`${item.name}${item.photo ? '' : ' — drawn illustration'}`}
          className="transition-transform duration-[1100ms] ease-[cubic-bezier(.16,1,.3,1)] group-hover:scale-[1.05]"
        />
        {item.signature && (
          <span className="pointer-events-none absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-canvas/92 px-3 py-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-leaf backdrop-blur-sm">
            <Sprig size={12} className="text-lime" />
            Signature
          </span>
        )}
      </div>

      <div className="mt-5 flex items-baseline gap-4">
        <h3
          className={[
            't-serif leading-tight text-ink',
            feature ? 'text-[clamp(1.5rem,1.2rem+1.2vw,2.1rem)]' : 'text-[clamp(1.15rem,1.05rem+0.45vw,1.4rem)]',
          ].join(' ')}
        >
          {item.name}
        </h3>
        <span aria-hidden="true" className="mb-1.5 h-px flex-1 bg-line" />
        {/* The price column. Empty until a real number exists — the
            layout keeps its place so filling it in changes nothing else. */}
        {item.price != null && (
          <span className="shrink-0 text-[0.9rem] font-semibold text-leaf">
            <span className="text-[0.7rem] font-medium text-ink-soft">AED </span>
            {item.price}
          </span>
        )}
      </div>

      {item.desc && (
        <p
          className={[
            'mt-2.5 leading-relaxed text-ink-soft',
            feature ? 'max-w-[48ch] text-[0.98rem]' : 'max-w-[38ch] text-[0.88rem]',
          ].join(' ')}
        >
          {item.desc}
        </p>
      )}
    </article>
  )
}
