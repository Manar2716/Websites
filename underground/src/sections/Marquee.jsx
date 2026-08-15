import { marquee } from '../data/content.js'

/* ═══════════════════════════════════════════════════════════════════
   MARQUEE

   A hairline strip between the hero and the story. The track is the
   same list twice and translates by exactly half its width, so the
   loop has no seam. It is `aria-hidden` and duplicated — a screen
   reader should not hear "MAJAN · DUBAI" four times — and every word
   in it appears somewhere else on the page as real content.
   ═══════════════════════════════════════════════════════════════════ */

export default function Marquee() {
  const run = [...marquee, ...marquee]
  return (
    <div
      className="relative overflow-hidden border-y border-cream/10 bg-basalt py-4 sm:py-5"
      aria-hidden="true"
    >
      <div className="flex w-max animate-[slide_38s_linear_infinite] items-center gap-10 whitespace-nowrap sm:gap-14">
        {run.map((word, i) => (
          <span key={i} className="flex items-center gap-10 sm:gap-14">
            <span className="font-mono text-[0.68rem] uppercase tracking-[0.3em] text-bone sm:text-[0.78rem]">
              {word}
            </span>
            <span className="inline-block h-1 w-1 rotate-45 bg-brass" />
          </span>
        ))}
      </div>

      {/* The strip fades into the page at both ends rather than being cut */}
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-16 sm:w-28"
        style={{ background: 'linear-gradient(90deg, var(--color-basalt), transparent)' }}
      />
      <span
        className="pointer-events-none absolute inset-y-0 right-0 w-16 sm:w-28"
        style={{ background: 'linear-gradient(270deg, var(--color-basalt), transparent)' }}
      />

      <style>{`
        @keyframes slide { to { transform: translate3d(-50%, 0, 0) } }
        @media (prefers-reduced-motion: reduce) {
          .animate-\\[slide_38s_linear_infinite\\] { animation: none }
        }
      `}</style>
    </div>
  )
}
