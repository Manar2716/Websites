/* ═══════════════════════════════════════════════════════════
   nav.js — the bar, the drawer, and which link is lit.

   Three states rather than two. `top` is the tall bar over the
   hero with no rule under it; `set` is the condensed bar with
   a hairline; `up` is `set` plus a reveal when the page is
   scrolled back upward, which is the only time a person
   actually wants the bar back. Hiding it on the way down buys
   the hero its full height on a phone.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var AUREL = global.AUREL, U = AUREL.U, S = AUREL.S, $ = AUREL.$, $$ = AUREL.$$;
  var doc = global.document, root = doc.documentElement;

  var nav = $('#nav'), burger = $('#burger'), drawer = $('#drawer');
  var links = $$('.nav__link');
  var state = 'top', anchor = 0;

  /* ── bar state ───────────────────────────────────────── */
  AUREL.sub(function () {
    var y = S.y, want;

    if (y < 40) { want = 'top'; anchor = y; }
    else if (S.dir > 0) {
      if (y - anchor > 80) { want = 'away'; } else { want = state === 'away' ? 'away' : 'set'; }
      if (want !== 'away') anchor = Math.min(anchor, y);
    } else {
      /* going back up: hold a little travel before showing the bar,
         so a scroll that overshoots and settles does not flash it */
      if (anchor - y > 60 || state !== 'away') { want = 'set'; anchor = Math.max(anchor, y); }
      else want = 'away';
    }
    if (S.dir > 0 && want === 'set') anchor = y;
    if (S.dir < 0 && want === 'away') anchor = y;

    if (want !== state) { state = want; nav.setAttribute('data-state', want); }
    return false;
  });

  /* ── scrollspy ───────────────────────────────────────────
     One observer over the sections, rather than a scroll
     handler measuring offsets. The link lights when a section
     owns the middle band of the viewport. */
  var byId = {};
  links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });

  var targets = Object.keys(byId).map(function (id) { return doc.getElementById(id); }).filter(Boolean);
  if (targets.length && global.IntersectionObserver) {
    var seen = {};
    var spy = new global.IntersectionObserver(function (entries) {
      entries.forEach(function (e) { seen[e.target.id] = e.isIntersecting ? e.intersectionRatio : 0; });
      var best = null, bestV = 0;
      Object.keys(seen).forEach(function (id) { if (seen[id] > bestV) { bestV = seen[id]; best = id; } });
      links.forEach(function (a) { a.classList.toggle('is-on', best != null && a === byId[best]); });
    }, { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.02, 1] });
    targets.forEach(function (t) { spy.observe(t); });
  }

  /* ── drawer ──────────────────────────────────────────────
     Focus is trapped while it is open and returned to the
     burger when it closes, and the page behind it is locked
     by fixing the body at its current offset — the only way
     to stop iOS scrolling the page under a fixed overlay. */
  var open = false, lockY = 0, lastFocus = null;

  function setDrawer(next) {
    if (next === open) return;
    open = next;

    if (open) {
      lockY = S.y; lastFocus = doc.activeElement;
      drawer.hidden = false;
      /* one frame between display and the class, or the
         transition has nothing to transition from */
      global.requestAnimationFrame(function () { root.classList.add('is-drawer'); });
      doc.body.style.top = (-lockY) + 'px';
      doc.body.classList.add('is-locked');
      burger.setAttribute('aria-expanded', 'true');
      burger.setAttribute('aria-label', 'Close menu');
      doc.addEventListener('keydown', onKey, true);
      var first = drawer.querySelector('.drawer__link');
      if (first) first.focus({ preventScroll: true });
    } else {
      root.classList.remove('is-drawer');
      doc.body.classList.remove('is-locked');
      doc.body.style.top = '';
      global.scrollTo(0, lockY);
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', 'Open menu');
      doc.removeEventListener('keydown', onKey, true);
      if (lastFocus) lastFocus.focus({ preventScroll: true });
      /* wait out the close transition before hiding, so it plays */
      global.setTimeout(function () { if (!open) drawer.hidden = true; }, AUREL.reduced() ? 0 : 420);
    }
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); setDrawer(false); return; }
    if (e.key !== 'Tab') return;
    var f = $$('a[href], button:not([disabled])', drawer);
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  burger.addEventListener('click', function () { setDrawer(!open); });
  drawer.addEventListener('click', function (e) {
    if (e.target.closest('a')) setDrawer(false);
  });

  /* ── in-page anchors ─────────────────────────────────────
     Native smooth scrolling, offset by the bar. Doing it here
     rather than with scroll-margin-top on every target keeps
     the offset in one place, and it lets a jump close the
     drawer and move focus in the same gesture — the focus move
     is what makes the keyboard land in the right place, which
     scroll-behavior alone does not do. */
  doc.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    if (!id) return;
    var target = doc.getElementById(id);
    if (!target) return;

    e.preventDefault();
    var pad = state === 'top' ? 0 : nav.offsetHeight;
    var to = target.getBoundingClientRect().top + (global.scrollY || 0) - pad - 8;

    global.scrollTo({ top: Math.max(0, to), behavior: AUREL.reduced() ? 'auto' : 'smooth' });
    if (global.history.replaceState) global.history.replaceState(null, '', '#' + id);

    /* move the keyboard with the page without stealing a
       second scroll — tabindex is removed again on blur so the
       section does not stay focusable */
    if (!target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '-1');
      target.addEventListener('blur', function once() {
        target.removeAttribute('tabindex');
        target.removeEventListener('blur', once);
      });
    }
    target.focus({ preventScroll: true });
  });

  /* a resize past the breakpoint should not leave a drawer open */
  global.addEventListener('resize', function () {
    if (open && global.innerWidth > 900) setDrawer(false);
  }, { passive: true });
})(window);
