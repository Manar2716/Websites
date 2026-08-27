/* ═══════════════════════════════════════════════════════════
   main.js — the motion that is not owned by a section.

   Entrances, counters, parallax, magnetic buttons. Everything
   here writes a custom property or a transform and nothing
   reads layout inside the loop.

   The rule the whole page is tuned against: motion carries
   information about weight and depth, or it does not happen.
   Nothing bounces, nothing spins, nothing arrives from a
   direction chosen at random, and no element travels further
   than about twenty-four pixels on entry. The reason a page
   like this reads as expensive is that its animation is easy
   to miss — you notice the absence of jolt, not the presence
   of movement.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var AUREL = global.AUREL, U = AUREL.U, S = AUREL.S, $ = AUREL.$, $$ = AUREL.$$;
  var doc = global.document;

  /* ── entrances ───────────────────────────────────────────
     Sections built by script are revealed after they exist,
     so a second pass runs on the next frame. */
  AUREL.reveals();
  global.requestAnimationFrame(function () { AUREL.reveals(); AUREL.measure(); });

  /* ── counters ────────────────────────────────────────────
     Counted once, on the frame the number becomes visible.
     The easing is the same long-tailed curve as the entrances,
     so a number lands rather than stops. */
  $$('[data-count]').forEach(function (node) {
    var to = parseFloat(node.getAttribute('data-count'));
    var dec = parseInt(node.getAttribute('data-decimals') || '0', 10);
    var suffix = node.getAttribute('data-suffix') || '';
    var done = false;

    function run() {
      if (done) return;
      done = true;
      if (AUREL.reduced()) { node.textContent = to.toFixed(dec) + suffix; return; }
      var t = 0;
      AUREL.sub(function (dt) {
        t += dt / 1.15;
        if (t >= 1) { node.textContent = to.toFixed(dec) + suffix; return false; }
        node.textContent = (to * U.out(t)).toFixed(dec) + suffix;
        return true;
      });
    }

    if (!global.IntersectionObserver) { run(); return; }
    var io = new global.IntersectionObserver(function (e) {
      if (e[0].isIntersecting) { io.disconnect(); run(); }
    }, { threshold: 0.6 });
    io.observe(node);
  });

  /* ── parallax ────────────────────────────────────────────
     Driven from the damped scroll copy, so the plates lag the
     page by a frame or two. That lag is the effect; matching
     the scroll exactly would just be a slower-moving image. */
  var DEPTH = { hero: -46, about: -34, clinic: -30 };

  $$('[data-parallax]').forEach(function (node) {
    if (AUREL.reduced()) return;
    var d = DEPTH[node.getAttribute('data-parallax')] || -28;
    AUREL.track(node, function (p) {
      /* p is 0 entering, 1 leaving — centre it so the plate is
         at rest when the section is */
      node.style.setProperty('--py', U.round((p - 0.5) * d, 2) + 'px');
    });
  });

  /* ── hero ────────────────────────────────────────────────
     Three things at once, all small: the specimen drifts a
     little against the cursor, the whole plate rises as the
     hero leaves, and the copy lifts slightly out of frame.
     Cursor tracking is pointer-fine only — on a phone there is
     no cursor, and reading a phone's gyroscope to fake one is
     a party trick that costs battery. */
  var hero = $('#hero'), plate = $('.hero__plate');

  if (hero && plate && !AUREL.reduced()) {
    AUREL.track(hero, function (p) {
      hero.style.setProperty('--hp', U.round(p, 4));
    });

    if (global.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      var mx = 0, my = 0, tx2 = 0, ty2 = 0;
      hero.addEventListener('pointermove', function (e) {
        var r = hero.getBoundingClientRect();
        tx2 = ((e.clientX - r.left) / r.width - 0.5) * 2;
        ty2 = ((e.clientY - r.top) / r.height - 0.5) * 2;
        AUREL.wake();
      });
      hero.addEventListener('pointerleave', function () { tx2 = 0; ty2 = 0; AUREL.wake(); });

      AUREL.sub(function (dt) {
        if (Math.abs(tx2 - mx) < 0.001 && Math.abs(ty2 - my) < 0.001) return false;
        mx = U.damp(mx, tx2, 5, dt);
        my = U.damp(my, ty2, 5, dt);
        plate.style.setProperty('--mx', U.round(mx * 13, 2) + 'px');
        plate.style.setProperty('--my', U.round(my * 11, 2) + 'px');
        return true;
      });
    }
  }

  /* ── magnetic buttons ────────────────────────────────────
     The button leans toward the cursor by a few pixels while
     it is inside it. Six pixels, not twenty: a control that
     runs away from the pointer is a joke, one that leans is a
     material. Pointer-fine only, and it releases on blur so a
     keyboard user never sees a button parked off-centre. */
  if (!AUREL.reduced() && global.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    $$('[data-magnetic]').forEach(function (btn) {
      var ax = 0, ay = 0, bx = 0, by = 0, live = false, sub = null;

      btn.addEventListener('pointerenter', function () { live = true; start(); });
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        bx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        by = ((e.clientY - r.top) / r.height - 0.5) * 2;
        AUREL.wake();
      });
      btn.addEventListener('pointerleave', function () { live = false; bx = 0; by = 0; AUREL.wake(); });
      btn.addEventListener('blur', function () { live = false; bx = 0; by = 0; AUREL.wake(); });

      function start() {
        if (sub) return;
        sub = AUREL.sub(function (dt) {
          var near = Math.abs(bx - ax) + Math.abs(by - ay);
          if (near < 0.002) {
            ax = bx; ay = by; write();
            if (!live) { sub.active = false; sub = null; }
            return false;
          }
          ax = U.damp(ax, bx, 16, dt);
          ay = U.damp(ay, by, 16, dt);
          write();
          return true;
        });
      }
      function write() {
        btn.style.setProperty('--bx', U.round(ax * 6, 2) + 'px');
        btn.style.setProperty('--by', U.round(ay * 4, 2) + 'px');
      }
    });
  }

  /* ── the strip ───────────────────────────────────────────
     The specialty strip under the hero drifts one way and
     nudges the other with scroll direction. It is a single
     transform on a single element and it is the seam between
     the hero and the page proper — the thing that stops the
     two reading as separate rectangles stacked up. */
  var strip = $('.hero__strip-track');
  if (strip && !AUREL.reduced()) {
    var off = 0, stripOn = true;

    /* This is the one continuous animation in the project, and
       therefore the one thing that can hold the frame loop
       awake indefinitely — so it is gated on the hero actually
       being in frame. Without the gate it runs for the entire
       length of the page, and the loop's whole park-when-idle
       design buys nothing: a person reading the clinic section
       is still paying for a marquee eight screens above them. */
    if (global.IntersectionObserver) {
      new global.IntersectionObserver(function (e) {
        stripOn = e[0].isIntersecting;
        if (stripOn) AUREL.wake();
      }, { threshold: 0 }).observe(strip.parentNode);
    }

    AUREL.sub(function (dt) {
      if (!stripOn || doc.hidden) return false;
      off -= 14 * dt;
      /* the track holds the list twice, so half is one full set */
      if (off < -50) off += 50;
      strip.style.setProperty('--sx', U.round(off, 3) + '%');
      return true;
    });
  }

  /* ── section seams ───────────────────────────────────────
     Each major section gets its own scroll progress as a
     custom property, which the stylesheet uses to fade the
     hairline dividers up as a section arrives and back down
     as it leaves. Cheap, and it is what makes the page read
     as continuous rather than as eight boxes. */
  $$('section[id]').forEach(function (sec) {
    AUREL.track(sec, function (p) {
      sec.style.setProperty('--sp', U.round(Math.sin(U.clamp(p, 0, 1) * Math.PI), 3));
    });
  });

  /* ── links that outlive the page ─────────────────────────
     Any anchor leaving this document opens in a new tab with
     the opener severed. There is exactly one on the page —
     the directions button — but the rule belongs here rather
     than in the markup, where the next person to add a link
     will not read it. */
  $$('a[href^="http"]').forEach(function (a) {
    if (a.host === global.location.host) return;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  });

  /* the page is only "ready" once fonts have settled, or the
     first measure lands against the wrong line heights */
  if (doc.fonts && doc.fonts.ready) {
    doc.fonts.ready.then(function () { AUREL.measure(); AUREL.wake(); });
  }
  global.addEventListener('load', function () { AUREL.measure(); AUREL.reveals(); });
})(window);
