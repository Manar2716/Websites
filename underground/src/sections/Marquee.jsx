import { marquee } from '../data/content.js'
import { Sprig } from '../components/ui.jsx'

/* A hairline strip between the hero and the story. The track is the
   same list twice and translates by exactly half its width, so the loop
   has no seam. It is aria-hidden and duplicated — a screen reader
   should not hear "MAJAN · DUBAI" four times — and every word in it
   appears somewhere else on the page as real content. */
export default function Marquee() {
  const run = [...marquee, ...marquee]
  return (
    <div className="relative overflow-hidden border-y border-line bg-panel py-4" aria-hidden="true">
      <div className="flex w-max animate-[slide_40s_linear_infinite] items-center gap-10 whitespace-nowrap sm:gap-14">
        {run.map((word, i) => (
          <span key={i} className="flex items-center gap-10 sm:gap-14">
            <span className="t-label text-ink-soft">{word}</span>
            <Sprig size={14} className="text-lime" />
          </span>
        ))}
      </div>
      <span
        className="pointer-events-none absolute inset-y-0 left-0 w-16 sm:w-28"
        style={{ background: 'linear-gradient(90deg, var(--color-panel), transparent)' }}
      />
      <span
        className="pointer-events-none absolute inset-y-0 right-0 w-16 sm:w-28"
        style={{ background: 'linear-gradient(270deg, var(--color-panel), transparent)' }}
      />
      <style>{`
        @keyframes slide { to { transform: translate3d(-50%, 0, 0) } }
        @media (prefers-reduced-motion: reduce) {
          .animate-\\[slide_40s_linear_infinite\\] { animation: none }
        }
      `}</style>
    </div>
  )
}
