/* ==========================================================================
   Page transitions and the boot sequence.

   The veil is markup, not something JavaScript injects. It starts covering
   the page and animates away with CSS, so a browser with scripting off — or
   a slow module load — still reveals the page rather than sitting behind a
   grey rectangle forever. JavaScript only adds the second half: covering the
   page again on the way out, so a navigation reads as one continuous move
   instead of a white flash.
   ========================================================================== */

import { caps, nextFrame } from './motion.js';

const OUT_MS = 460;

/* ------------------------------------------------------------------ boot -- */

/**
 * Lifts the veil. Called once the first paint has something real behind it,
 * so the reveal lands on content rather than on skeletons.
 */
export async function revealPage() {
  const veil = document.querySelector('.page-veil');
  if (!veil) return;
  document.documentElement.classList.add('is-ready');
  await nextFrame();
  veil.classList.add('is-open');
  // Removed rather than left at opacity 0: a full-screen fixed layer that
  // stays in the tree is one more thing for the compositor to consider.
  setTimeout(() => veil.remove(), caps.reduced ? 0 : 900);
}

/* ------------------------------------------------------- link intercept -- */

function isInternalNavigation(link, event) {
  if (event.defaultPrevented) return false;
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (!link || link.target === '_blank' || link.hasAttribute('download')) return false;
  if (link.dataset.noTransition !== undefined) return false;

  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin) return false;
  // Same page, different hash: that is a scroll, not a navigation.
  if (url.pathname === location.pathname && url.hash) return false;
  if (url.href === location.href) return false;
  return url;
}

/**
 * Covers the page, then navigates. The timeout is a safety net: if the
 * animation never fires — reduced motion, a stalled compositor — the
 * navigation still happens, because a link that does nothing is far worse
 * than a link without a transition.
 */
export function initPageTransitions() {
  const veil = document.querySelector('.page-veil');

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    const url = isInternalNavigation(link, e);
    if (!url) return;

    e.preventDefault();

    if (!veil || caps.reduced) { location.href = url.href; return; }

    veil.classList.remove('is-open');
    veil.classList.add('is-closing');
    document.documentElement.classList.add('is-leaving');

    let navigated = false;
    const go = () => {
      if (navigated) return;
      navigated = true;
      location.href = url.href;
    };
    veil.addEventListener('transitionend', go, { once: true });
    setTimeout(go, OUT_MS + 120);
  });

  // Coming back via the bfcache should not land on a covered page.
  addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    document.documentElement.classList.remove('is-leaving');
    veil?.classList.add('is-open');
  });
}

/* --------------------------------------------------------- section wipe -- */

/**
 * Progress bar along the top edge. Purely decorative, one transform write
 * per frame, and skipped under reduced motion.
 */
export function initScrollProgress() {
  const bar = document.querySelector('[data-scroll-progress]');
  if (!bar || caps.reduced) return;

  import('./motion.js').then(({ onFrame, scroll, round }) => {
    onFrame(() => {
      bar.style.transform = `scaleX(${round(scroll.progress, 4)})`;
    });
  });
}
