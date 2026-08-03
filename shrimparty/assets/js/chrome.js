/* ═══════════════════════════════════════════════════════════
   chrome.js — the things that are the same on every page.

   Two jobs: the transition between pages, and the small amount
   of state the header carries.

   ── ON PAGE TRANSITIONS ────────────────────────────────────

   This is a static site with no router and no build step. Every
   link is a real navigation to a real document, which is what
   makes the back button, middle-click, "open in new tab" and
   find-in-page all work without a line of code. Nothing here is
   allowed to break that.

   So the transition is a *cover*, not a swap. A click on an
   internal link is intercepted, the page goes under — a wash of
   water rises, the content sinks and blurs out — and only then
   does the navigation happen. The next document runs the second
   half on load: the wash drains and the content surfaces.

   The two halves are separate documents and cannot share state,
   so they have to agree by construction rather than by handshake:
   both are the same CSS animation on the same element, one
   forward and one reversed, and the outgoing half is capped at a
   duration short enough that a slow connection cannot leave a
   visitor staring at a full-screen wash. If navigation has not
   started by then it happens anyway.

   With scripting off, none of this runs and the links are links.
   With reduced motion, the wash is skipped and the navigation is
   immediate.

   ── WHY NOT THE VIEW TRANSITIONS API ───────────────────────

   Cross-document view transitions would do this in four lines of
   CSS, and they are the right answer on a site that can require
   a current Chromium. This one cannot: the fallback path would
   still need writing, and then there are two transition systems
   to keep in agreement instead of one. The single JS path runs
   everywhere and looks the same everywhere.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SHRIMP = (global.SHRIMP = global.SHRIMP || {});
  var doc = document, root = doc.documentElement;

  /* How long the outgoing half runs before the navigation fires.
     Kept under a third of a second: this is dead time the visitor
     did not ask for, and the incoming document's own half is
     where the effect actually reads. */
  var OUT_MS = 300;

  function init() {
    var reduced = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var wash = doc.querySelector('.wash');

    /* ── the incoming half ──────────────────────────────────
       Runs on every load, including the first one, which is what
       makes arriving at the site and moving inside it feel like
       the same gesture. */
    if (wash && !reduced) {
      root.classList.add('is-arriving');
      /* two frames, so the class lands before the transition
         starts and the browser has something to animate from */
      global.requestAnimationFrame(function () {
        global.requestAnimationFrame(function () {
          root.classList.remove('is-arriving');
        });
      });
    }

    /* Coming back through the bfcache re-shows a document that was
       left mid-transition, with `is-leaving` still on it. Without
       this the back button lands on a page hidden behind its own
       wash. */
    global.addEventListener('pageshow', function (e) {
      if (e.persisted) {
        root.classList.remove('is-leaving');
        root.classList.remove('is-arriving');
      }
    });

    /* ── the outgoing half ──────────────────────────────────── */
    function internal(a) {
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return null;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#') return null;
      if (/^(mailto:|tel:|https?:\/\/)/i.test(href)) {
        /* an absolute URL to this same origin is still internal */
        if (a.host !== global.location.host) return null;
      }
      var url = a.href;
      /* a link to the page we are already on, or to an anchor on
         it, is not a navigation worth covering */
      if (url.split('#')[0] === global.location.href.split('#')[0]) return null;
      return url;
    }

    doc.addEventListener('click', function (e) {
      if (e.defaultPrevented) return;
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target.closest ? e.target.closest('a[href]') : null;
      var url = internal(a);
      if (!url) return;

      if (reduced || !wash) return;      /* let the browser do it */

      e.preventDefault();
      if (root.classList.contains('is-leaving')) return;
      root.classList.add('is-leaving');

      var went = false;
      function go() { if (!went) { went = true; global.location.href = url; } }
      setTimeout(go, OUT_MS);
      /* if the animation finishes first, do not wait out the timer */
      wash.addEventListener('transitionend', go, { once: true });
    });

    /* ── header state ────────────────────────────────────────
       The active link is marked in the markup rather than derived
       here, so it is right before any script runs. All this does
       is give the header something to hang a scrolled state on;
       on pages with a film, site.js owns that instead. */
    var nav = doc.getElementById('nav');
    if (nav && !doc.getElementById('film')) {
      var solid = false;
      global.addEventListener('scroll', function () {
        var want = (global.scrollY || 0) > 40;
        if (want !== solid) { solid = want; nav.classList.toggle('is-solid', solid); }
      }, { passive: true });
      if ((global.scrollY || 0) > 40) nav.classList.add('is-solid');
    }

    /* ── the menu on a narrow screen ─────────────────────────
       A real site needs its sections reachable on a phone, and
       the desktop header hides everything but the reserve button
       below 860px. The panel is a plain list behind a button —
       no library, and it works from the keyboard because it is
       a button and a list. */
    var toggle = doc.getElementById('navToggle');
    var drawer = doc.getElementById('navDrawer');
    if (toggle && drawer) {
      var open = false;
      function setOpen(v) {
        open = v;
        toggle.setAttribute('aria-expanded', String(v));
        drawer.classList.toggle('is-open', v);
        root.classList.toggle('is-locked', v);
      }
      toggle.addEventListener('click', function () { setOpen(!open); });
      drawer.addEventListener('click', function (e) {
        if (e.target.closest('a')) setOpen(false);
      });
      doc.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && open) { setOpen(false); toggle.focus(); }
      });
    }
  }

  SHRIMP.Chrome = { init: init };

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();

})(window);
