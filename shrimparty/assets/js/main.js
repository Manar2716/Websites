/* ═══════════════════════════════════════════════════════════
   main.js — boot, one clock, and the two things it drives.

   There is a single requestAnimationFrame loop for the whole
   site and it stops. Scroll, pointer and resize handlers never
   read layout and never do work — they park a number and
   return, and everything happens once per frame against those
   numbers. Offsets the loop needs are measured on load and on
   resize into a small table it reads from.

   The loop runs when there is something to run for: the film
   is on screen, or the table is open. Scroll past the film with
   the table closed and the WebGL context is doing nothing at
   all, which matters because the rest of the page is a long
   read and a six-pass renderer idling behind it would cost a
   laptop its battery for no picture.

   The frame budget is spent rather than saved: the render scale
   is moved at runtime from measured frame time towards 110 fps,
   because on a page where you drag a shell around with a
   pointer, latency is the thing you feel first.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SP = global.SP;
  var M = SP.M, D = SP.Dishes;
  var doc = document;
  var html = doc.documentElement;

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var debug = /[?&]debug\b/.test(location.search);

  /* ── the clock and the scroll store ───────────────────── */
  var scrollY = global.scrollY || 0, needScroll = true;
  var vw = 0, vh = 0;
  var box = { filmTop: 0, filmH: 1 };

  function measure() {
    vw = global.innerWidth; vh = global.innerHeight;
    var film = doc.querySelector('.film');
    if (film) {
      var r = film.getBoundingClientRect();
      box.filmTop = r.top + global.scrollY;
      box.filmH = Math.max(1, film.offsetHeight - vh);
    }
  }

  global.addEventListener('scroll', function () { needScroll = true; }, { passive: true });
  global.addEventListener('resize', function () { measure(); needResize = true; }, { passive: true });

  /* ── the canvas ───────────────────────────────────────── */
  var canvas = doc.getElementById('gl');
  var stage = null, cam = null, scenes = null, site = null;
  var needResize = true;

  function boot() {
    measure();
    site = SP.Site({
      onOpenTable: openTable,
      onCloseTable: closeTable
    });
    site.onGo = go;
    site.onOpenDish = openDish;
    site.onCloseDish = closeDish;

    try {
      stage = SP.Stage(canvas, {});
    } catch (err) {
      /* a shader that will not compile is a bug, not a device
         problem — say so in the console and leave the page as
         the poster and the menu, which is a complete site */
      if (global.console) console.error(err);
      stage = null;
    }
    if (!stage) { html.classList.remove('is-booting'); return; }

    cam = SP.Camera();
    cam.handheld = reduced ? 0 : 1;
    D.registerForms(stage);
    scenes = SP.Scenes(stage, cam);
    scenes.setReduced(reduced);

    /* warm the shaders and the first meshes on a hidden frame so
       the first visible one is not the one that compiles nine
       programs and builds forty forms */
    stage.resize(vw, vh);
    D.aspect = vw / vh;
    scenes.film(0, 1 / 60, 0);
    cam.update(1 / 60, vw / vh, 0).snap();
    stage.render(cam, { fade: 0 });
    /* the CSS poster is an opaque ground sitting in front of the
       canvas; it only comes off once there is a real frame */
    html.classList.add('has-gl');

    caps = Array.prototype.slice.call(doc.querySelectorAll('.cap'));
    wirePointer();
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);

    setTimeout(function () { html.classList.remove('is-booting'); }, 260);
  }

  /* ══════════════════════════════════════════════════════════
     THE TABLE
     ══════════════════════════════════════════════════════════ */

  var tableOn = false, openAmt = 0, openWant = 0, openIndex = -1;

  function openTable(index) {
    if (!scenes) return;
    tableOn = true;
    canvas.classList.add('is-on');
    canvas.style.pointerEvents = 'none';   /* the overlay takes the pointer */
    scenes.clearParticles();
    scenes.goto(index, true);
    openIndex = -1; openWant = 0; openAmt = 0;
    scenes.close();
    /* place the camera before the first frame, so the overlay
       fades up onto a composed shot rather than onto a swing */
    scenes.table(1 / 60, clock);
    cam.update(1 / 60, vw / vh, clock).snap();
    site.setDish(SP.DISHES[index], index, false);
    wake();
  }

  function closeTable() {
    tableOn = false;
    openWant = 0;
    scenes.close();
    canvas.classList.toggle('is-on', filmVisible());
    wake();
  }

  function go(a, relative) {
    if (!scenes) return;
    var i = relative ? scenes.want + a : a;
    i = Math.max(0, Math.min(SP.DISHES.length - 1, i));
    scenes.goto(i);
    if (openIndex >= 0) closeDish();
    site.setDish(SP.DISHES[i], i, false);
    wake();
  }

  function openDish() {
    if (!scenes) return;
    var i = scenes.index();
    openIndex = i; openWant = 1;
    scenes.open(i);
    site.setDish(SP.DISHES[i], i, true);
    wake();
  }

  /* Returns true when it actually closed something, so Escape
     can fall through to leaving the table. */
  function closeDish(fromKey) {
    if (openIndex < 0) return false;
    openIndex = -1; openWant = 0;
    /* The scene owns which plate is open, and it has to be told —
       leaving it pointing at a dish the rail has already glided
       away from means that plate stays pinned in memory, and then
       gets culled out from under the camera that is still framing
       it. */
    scenes.close();
    scenes.deselect();
    var i = scenes.index();
    site.setDish(SP.DISHES[i], i, false);
    wake();
    return true;
  }

  /* ══════════════════════════════════════════════════════════
     POINTER

     Everything the pointer does on the table goes through here:
     dolly along the rail with a drag on the background, pick and
     open a dish, select a piece, and drag a piece around.

     Which of those a drag turns out to be is decided by what was
     under it when it went down, which is the only way a single
     pointer can serve both "move the camera" and "move that
     shell" without a mode switch.
     ══════════════════════════════════════════════════════════ */

  var ptr = { x: 0, y: 0, ndcX: 0, ndcY: 0, down: false, mode: null, startX: 0, startY: 0, startAt: 0 };
  var overlay = doc.getElementById('table');

  function toNdc(e) {
    ptr.x = e.clientX; ptr.y = e.clientY;
    ptr.ndcX = (e.clientX / vw) * 2 - 1;
    ptr.ndcY = 1 - (e.clientY / vh) * 2;
  }

  function wirePointer() {
    overlay.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button, a, input, .table__top, .table__nav, .table__caption')) return;
      toNdc(e);
      ptr.down = true; ptr.moved = 0;
      ptr.startX = e.clientX; ptr.startY = e.clientY; ptr.startAt = scenes.want;
      overlay.setPointerCapture(e.pointerId);
      /* a piece under the pointer means this drag is that piece;
         anything else and it is the rail */
      ptr.mode = (openAmt > .3 && scenes.grab(ptr.ndcX, ptr.ndcY)) ? 'part' : 'rail';
      site.setCursor(false, true);
      wake();
    });

    overlay.addEventListener('pointermove', function (e) {
      toNdc(e);
      if (ptr.down) {
        if (ptr.mode === 'part') scenes.drag(ptr.ndcX, ptr.ndcY);
        else {
          /* one screen width of drag is about three dishes */
          var dx = (ptr.startX - e.clientX) / vw * 3.2;
          scenes.want = Math.max(0, Math.min(SP.DISHES.length - 1, ptr.startAt + dx));
        }
      }
      wake();
    });

    function up(e) {
      if (!ptr.down) return;
      ptr.down = false;
      /* A press that did not travel is a click, whatever it
         landed on. Deciding that up front is what lets one
         pointer both pick a shrimp up and open it: put it down
         where you found it and the dish takes it as a choice;
         move it first and the dish takes it as a throw. */
      var travel = Math.abs(e.clientX - ptr.startX) + Math.abs(e.clientY - ptr.startY);
      var tap = travel < 7;

      if (ptr.mode === 'part') {
        if (tap) {
          scenes.ungrab();
          scenes.selectAt(ptr.ndcX, ptr.ndcY);
        } else {
          scenes.release();
        }
      } else if (tap) {
        if (openAmt > .3) {
          var hit = scenes.selectAt(ptr.ndcX, ptr.ndcY);
          if (!hit) {
            /* nothing solid under the pointer: a tap on the
               liquid rings it, and a tap on a drink knocks it */
            if (!scenes.touchLiquid(ptr.ndcX, ptr.ndcY)) scenes.knock();
          }
        } else {
          var i = Math.round(scenes.want);
          scenes.goto(i);
          openDish();
        }
      } else {
        scenes.want = Math.round(scenes.want);
      }
      ptr.mode = null;
      site.setCursor(false, false);
      wake();
    }
    overlay.addEventListener('pointerup', up);
    overlay.addEventListener('pointercancel', up);

    /* the wheel moves along the table rather than scrolling the
       page underneath it */
    overlay.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (openAmt > .3) return;
      scenes.want = Math.max(0, Math.min(SP.DISHES.length - 1,
        scenes.want + (e.deltaY + e.deltaX) * .0035));
      clearTimeout(wheelSnap);
      wheelSnap = setTimeout(function () { scenes.want = Math.round(scenes.want); wake(); }, 160);
      wake();
    }, { passive: false });
    var wheelSnap = null;
  }

  /* ══════════════════════════════════════════════════════════
     THE FILM'S CAPTIONS
     ══════════════════════════════════════════════════════════ */

  var caps = [];
  function driveCaps(p) {
    for (var i = 0; i < caps.length; i++) {
      var el = caps[i];
      var a = +el.dataset.from, b = +el.dataset.to;
      /* in over the first eighth of its span, out over the last */
      var span = b - a;
      var inN = M.range(p, a, a + span * .16);
      var outN = M.range(p, b - span * .18, b);
      var v = Math.min(inN, 1 - outN);
      /* a caption that starts at the top of the film has nothing
         to enter from, so it is on screen in the first painted
         frame rather than condensing into place */
      if (a === 0) v = 1 - outN;
      var o = M.sat(v);
      el.style.opacity = o;
      el.style.transform = 'translate3d(0,' + ((1 - o) * 20).toFixed(2) + 'px,0)';
      el.style.visibility = o < .01 ? 'hidden' : '';
    }
  }

  /* ══════════════════════════════════════════════════════════
     THE LOOP
     ══════════════════════════════════════════════════════════ */

  var running = false, last = 0, clock = 0;
  var idle = 0;
  var frames = 0, msAcc = 0, avgMs = 8;
  var perfEl = doc.getElementById('tableperf');
  if (debug && perfEl) perfEl.hidden = false;

  function filmVisible() {
    return scrollY < box.filmTop + box.filmH + vh * .5;
  }

  function wake() {
    idle = 0;
    if (!running && stage) { running = true; last = performance.now(); requestAnimationFrame(frame); }
  }

  function frame(now) {
    var dt = Math.min(.05, (now - last) / 1000);
    last = now;
    clock += dt;

    if (needScroll) { scrollY = global.scrollY; needScroll = false; }
    D.aspect = vw / vh;
    if (needResize) { measure(); stage.resize(vw, vh); needResize = false; }

    var showFilm = filmVisible();
    canvas.classList.toggle('is-on', tableOn || showFilm);

    /* nav chrome, cheap and once a frame */
    site.setStuck(scrollY > 40);
    site.sweepReveals();

    var look = null;
    if (tableOn) {
      openAmt = M.damp(openAmt, openWant, reduced ? 40 : 4.6, dt);
      scenes.setOpenAmount(openAmt);
      scenes.settle(dt);

      /* hovering: only worth doing when there is something to
         hover, and it also drives the cursor */
      var hoverId = null;
      if (!ptr.down && openAmt > .3) {
        hoverId = scenes.hoverAt(ptr.ndcX, ptr.ndcY);
        site.setCursor(!!hoverId, false);
      } else if (!ptr.down) {
        scenes.ctx.hover = null;
        site.setCursor(false, false);
      }

      stage.begin(clock);
      look = scenes.table(dt, clock);
      site.setPart(openAmt > .3 ? scenes.hoverLabel() : null);

      /* the caption follows the rail: settle on a new dish and
         the words change with it */
      var idx = scenes.index();
      if (idx !== lastCaption) {
        lastCaption = idx;
        site.setDish(SP.DISHES[idx], idx, openIndex === idx);
      }
    } else if (showFilm) {
      var p = M.sat((scrollY - box.filmTop) / box.filmH);
      driveCaps(p);
      stage.begin(clock);
      look = scenes.film(p, dt, clock);
    }

    if (look) {
      cam.update(dt, vw / vh, clock);
      stage.render(cam, look);
      idle = 0;
    } else {
      idle += dt;
    }

    /* adaptive scale, from a running mean rather than from the
       last frame, and only while there is something to measure */
    if (look) {
      msAcc += (performance.now() - now); frames++;
      if (frames >= 30) {
        avgMs = msAcc / frames; frames = 0; msAcc = 0;
        stage.adapt(avgMs, vw, vh);
        if (debug && perfEl) {
          perfEl.textContent =
            avgMs.toFixed(1) + ' ms · scale ' + stage.renderScale().toFixed(2) +
            ' · tier ' + stage.tier + ' · ' + stage.instanceCount() + ' inst · ' +
            stage.drawCalls() + ' calls · ' + stage.spriteCount() + ' sprites';
        }
      }
    }

    if (idle > .5 && !tableOn) { running = false; return; }
    requestAnimationFrame(frame);
  }
  var lastCaption = -1;

  /* stop entirely when the tab is not being looked at */
  doc.addEventListener('visibilitychange', function () {
    if (doc.hidden) running = false;
    else wake();
  });
  global.addEventListener('scroll', wake, { passive: true });
  global.addEventListener('pointermove', function (e) {
    if (!tableOn) return;
    toNdc(e);
  }, { passive: true });

  /* A debug handle, behind `?debug`, and nothing else on the
     global object. It exists because the two things worth
     checking on this page — where the film is and what the
     pointer is actually picking — are both invisible from the
     outside. */
  if (debug) {
    global.__shrimparty = {
      seek: function (p) { global.scrollTo(0, box.filmTop + box.filmH * p); },
      table: function (i) { site.show(i || 0); },
      open: openDish,
      stage: function () { return stage; },
      cam: function () { return cam; },
      scenes: function () { return scenes; },
      /* what is selected, how far the peel has run, and what the
         pointer would pick at a given point in the frame */
      sel: function () { return scenes.ctx.sel; },
      peel: function () { return scenes.ctx.peel; },
      pickAt: function (x, y) { return stage.pick(cam, x, y); }
    };
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window);
