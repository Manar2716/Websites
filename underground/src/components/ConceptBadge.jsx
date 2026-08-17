import { OFFICIAL_URL } from '../data/content.js'

/* ═══════════════════════════════════════════════════════════════════
   CONCEPT BADGE

   A permanent, always-visible marker that this is not Underground's
   site.

   The footer already says so, but a footer only reaches somebody who
   scrolls to the bottom, and this page is convincing enough that a
   link passed around could be taken for the real thing — with a real
   address and a real phone number on it. Anything hosted at a URL
   needs the disclaimer where it cannot be missed, so this sits fixed
   in the corner on every screen, at every scroll position, and links
   straight to the actual site.

   It is deliberately small and quiet, and deliberately not dismissible.
   ═══════════════════════════════════════════════════════════════════ */

export default function ConceptBadge() {
  return (
    <a
      href={OFFICIAL_URL}
      target="_blank"
      rel="noopener noreferrer"
      data-cursor="link"
      className="group fixed bottom-3 left-3 z-[97] flex items-center gap-2 rounded-full border border-cream/15 bg-ground/80 px-3 py-2 font-mono text-[0.55rem] uppercase leading-none tracking-[0.16em] text-dust backdrop-blur-md transition-colors duration-500 hover:border-brass/50 hover:text-bone sm:bottom-5 sm:left-5 sm:px-3.5 sm:text-[0.6rem]"
      style={{
        marginBottom: 'env(safe-area-inset-bottom, 0px)',
        marginLeft: 'env(safe-area-inset-left, 0px)',
      }}
    >
      <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-ember" aria-hidden="true" />
      <span>
        Design concept
        <span className="hidden sm:inline"> &mdash; not the official site</span>
      </span>
      <svg
        viewBox="0 0 14 14"
        width="10"
        height="10"
        aria-hidden="true"
        className="shrink-0 transition-transform duration-500 ease-[cubic-bezier(.16,1,.3,1)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
      >
        <path d="M3 11L11 3M4.5 3H11v6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    </a>
  )
}
