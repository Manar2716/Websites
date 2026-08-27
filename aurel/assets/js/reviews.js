/* ═══════════════════════════════════════════════════════════
   reviews.js — a rail that drifts, and stops the moment you
   touch it.

   The rail is a real overflow-x element, not a transformed
   track. That is the whole design decision here: it means a
   trackpad, a touchscreen, a scrollbar, Tab and the arrow keys
   all work without a line of code, and the drag handler below
   is a convenience on top rather than a reimplementation of
   scrolling. Carousels that transform a track have to rebuild
   every one of those, and usually rebuild about half.

   The drift is continuous rather than slide-by-slide. The set
   is rendered twice and the scroll offset wraps at the halfway
   mark, which is invisible because the second copy is
   identical to the first. Slide-by-slide auto-advance is the
   thing that makes a testimonial section feel like an advert;
   a slow drift reads as a shelf you are walking past.

   Ratings are four thin marks and a fifth left open where the
   review is four stars — legible at a glance, and nothing like
   a row of gold cartoon stars.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var AUREL = global.AUREL, U = AUREL.U, el = AUREL.el, $ = AUREL.$;
  var rail = $('#revrail'), track = $('#revtrack');
  if (!rail || !track) return;

  var R = AUREL.REVIEWS;
  var SPEED = 17;           /* px per second — a walking pace */
  var paused = false, dragging = false, half = 0, visible = false, hold = 0;
  var vx = 0, lastX = 0, lastT = 0;

  function card(r, clone) {
    var c = el('article', 'rv' + (clone ? ' rv--clone' : ' reveal'));
    if (clone) c.setAttribute('aria-hidden', 'true');

    var marks = '';
    for (var i = 0; i < 5; i++) {
      marks += '<i class="rv__tick' + (i < r.stars ? ' is-on' : '') + '" style="--i:' + i + '"></i>';
    }

    c.innerHTML =
      '<p class="rv__rating"><span class="rv__ticks" aria-hidden="true">' + marks + '</span>' +
        '<span class="sr-only">' + r.stars + ' out of 5</span></p>' +
      '<blockquote class="rv__quote"><p>' + r.body + '</p></blockquote>' +
      '<footer class="rv__foot">' +
        '<p class="rv__name">' + r.name + '</p>' +
        '<p class="rv__meta">' + r.tx + ' · ' + r.when + '</p>' +
      '</footer>';
    return c;
  }

  R.forEach(function (r) { track.appendChild(card(r, false)); });
  /* the second pass is what makes the wrap invisible */
  R.forEach(function (r) { track.appendChild(card(r, true)); });

  function measure() { half = track.scrollWidth / 2; }
  measure();
  global.addEventListener('resize', measure, { passive: true });
  global.addEventListener('load', measure);

  /* ── the drift ───────────────────────────────────────────
     Sub-pixel is accumulated separately, because writing a
     fractional scrollLeft and reading it back loses the
     fraction and the rail would creep at whole pixels only —
     which at 17px/s is visible stepping. */
  var frac = 0;

  /* ── on screen only ──────────────────────────────────────
     The drift is gated on the rail being in frame. Without
     this it starts the moment the page loads and runs the
     whole way down: by the time somebody scrolls to the
     reviews it has already walked several hundred pixels and
     opens mid-card, and it has been holding the frame loop
     awake for the entire journey to get there. */
  if (global.IntersectionObserver) {
    new global.IntersectionObserver(function (e) {
      visible = e[0].isIntersecting;
      if (visible) AUREL.wake();
    }, { threshold: 0.05 }).observe(rail);
  } else {
    visible = true;
  }

  AUREL.sub(function (dt) {
    if (!visible || paused || dragging || AUREL.reduced() || !half) return false;
    if (global.document.hidden) return false;
    /* Writing scrollLeft cancels a native smooth scroll, so the
       drift has to stand off while one is in flight — otherwise
       the arrow buttons appear to do nothing at all: the first
       frame of drift kills the animation they just started. */
    if (global.performance.now() < hold) return true;

    frac += SPEED * dt;
    var whole = Math.floor(frac);
    if (whole) {
      frac -= whole;
      rail.scrollLeft += whole;
      if (rail.scrollLeft >= half) rail.scrollLeft -= half;
    }
    return true;
  });

  /* Keep the wrap honest when a person scrolls the rail
     themselves. `armed` is why the rail opens flush against
     its gutter: at rest it sits at scrollLeft 0, and wrapping
     backwards from 0 must not fire until the rail has actually
     moved forward at least once — otherwise the very first
     scroll event teleports it into the middle of the second
     copy and the first card opens half cut off. */
  var armed = false;

  rail.addEventListener('scroll', function () {
    if (!half) return;
    if (rail.scrollLeft > 4) armed = true;
    /* wrap forward a pixel past the seam, so the result is
       never exactly 0 and cannot trip the backward wrap */
    if (rail.scrollLeft >= half + 1) rail.scrollLeft -= half;
    else if (armed && rail.scrollLeft < 1) rail.scrollLeft = half;
  }, { passive: true });

  /* ── pause ───────────────────────────────────────────────
     Hover, focus and touch all stop it. Nothing is more
     irritating than a testimonial sliding out from under the
     sentence you were halfway through. */
  ['pointerenter', 'focusin'].forEach(function (ev) {
    rail.addEventListener(ev, function () { paused = true; });
  });
  ['pointerleave', 'focusout'].forEach(function (ev) {
    rail.addEventListener(ev, function () { paused = false; AUREL.wake(); });
  });
  global.document.addEventListener('visibilitychange', function () { AUREL.wake(); });

  /* ── drag ────────────────────────────────────────────────
     Grab-and-throw on top of native scrolling. Touch is left
     entirely alone — a phone already throws this rail better
     than any handler here would. */
  rail.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch') return;
    dragging = true; paused = true;
    lastX = e.clientX; lastT = global.performance.now(); vx = 0;
    rail.classList.add('is-grab');
    try { rail.setPointerCapture(e.pointerId); } catch (err) {}
  });

  rail.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    e.preventDefault();
    var now = global.performance.now();
    var dx = e.clientX - lastX;
    var dt = Math.max(1, now - lastT);
    vx = dx / dt * 16;            /* px per frame, for the throw */
    rail.scrollLeft -= dx;
    lastX = e.clientX; lastT = now;
  });

  function release() {
    if (!dragging) return;
    dragging = false;
    rail.classList.remove('is-grab');

    /* the throw: decay what was left of the gesture's velocity */
    if (Math.abs(vx) > 0.6 && !AUREL.reduced()) {
      var v = vx;
      AUREL.sub(function () {
        if (dragging || Math.abs(v) < 0.25) return false;
        rail.scrollLeft -= v;
        v *= 0.93;
        return true;
      });
    }
    AUREL.wake();
  }
  rail.addEventListener('pointerup', release);
  rail.addEventListener('pointercancel', release);

  /* ── controls ────────────────────────────────────────── */
  function step(dir) {
    var first = track.querySelector('.rv');
    var by = first ? first.getBoundingClientRect().width + 24 : rail.clientWidth * 0.8;
    hold = global.performance.now() + (AUREL.reduced() ? 0 : 900);
    rail.scrollBy({ left: dir * by, behavior: AUREL.reduced() ? 'auto' : 'smooth' });
    AUREL.wake();
  }
  $('#revprev').addEventListener('click', function () { step(-1); });
  $('#revnext').addEventListener('click', function () { step(1); });

  rail.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  });

  global.requestAnimationFrame(measure);
})(window);
