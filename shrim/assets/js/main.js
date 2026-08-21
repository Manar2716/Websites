/* ═══════════════════════════════════════════════════════════
   main.js — boot, the clock, the scroll store, and the stages.

   One requestAnimationFrame loop drives the whole page: two
   renderers, the reveals, the nav, the cursor and the map. There
   is no second loop and no timer anywhere in this project.

   The loop also stops. Both stages cull themselves when their
   section is off screen, and when neither is visible and nothing
   has moved for half a second the frame callback is not
   rescheduled at all — a page sitting in the footer costs
   nothing. Anything that could start motion again (a scroll, a
   pointer, a resize, a click) wakes it.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SHRIM = global.SHRIM;
  var M = SHRIM.M, Site = SHRIM.Site;
  var doc = global.document, root = doc.documentElement;
  var $ = Site.$, $$ = Site.$$;

  /* ── capability tiers ────────────────────────────────────────
     Measured off the device, then adjusted at runtime by the
     frame timer in pass.js. These numbers are the only thing
     separating a phone from a workstation: it is the same food,
     drawn with a smaller shadow map and fewer puffs of steam. */

  function detectTier() {
    var dpr = global.devicePixelRatio || 1;
    var cores = global.navigator.hardwareConcurrency || 4;
    var mem = global.navigator.deviceMemory || 4;
    var w = global.innerWidth;
    var coarse = global.matchMedia('(pointer: coarse)').matches;

    var score = 0;
    if (cores >= 8) score += 2; else if (cores >= 4) score += 1;
    if (mem >= 8) score += 2; else if (mem >= 4) score += 1;
    if (w >= 1280) score += 1;
    if (coarse) score -= 2;
    if (w < 700) score -= 1;

    if (score >= 4) return { name: 'high', shadowSize: 1024, steam: 34, detail: 1, maxScale: Math.min(dpr, 1.75), rice: 200, noodles: 12 };
    if (score >= 2) return { name: 'mid', shadowSize: 768, steam: 22, detail: 0.85, maxScale: Math.min(dpr, 1.4), rice: 140, noodles: 9 };
    return { name: 'low', shadowSize: 512, steam: 12, detail: 0.6, maxScale: Math.min(dpr, 1.1), rice: 90, noodles: 7 };
  }

  /* ── the scroll store ────────────────────────────────────────
     Every listener on this page writes into this object and
     returns. Nothing reads layout in a handler. */

  var store = {
    y: global.scrollY || 0,
    vh: global.innerHeight,
    vw: global.innerWidth,
    px: -200, py: -200,
    nx: 0, ny: 0            /* pointer, in −1..1 of the viewport */
  };

  var tier = detectTier();
  var reduced = root.getAttribute('data-motion') === 'off';

  var heroStage = null, heroPlate = null;
  var dishStage = null, dishPlate = null;
  var menu = null, nav = null, reveals = null, cursor = null, map = null;

  var layout = { heroTop: 0, heroH: 1, menuTop: 0, menuH: 1, placeTop: 0, placeH: 1 };
  var heroCanvas = $('#herocanvas'), dishCanvas = $('#dishcanvas');
  var heroSection = $('#home'), menuSection = $('#menu'), placeSection = $('#location');

  var running = false, lastT = 0, wakeUntil = 0, booted = false, frames = 0;

  function wake(ms) {
    wakeUntil = Math.max(wakeUntil, now() + (ms === undefined ? 600 : ms));
    if (!running) start();
  }
  function now() { return global.performance ? global.performance.now() : Date.now(); }

  /* ── measurement ─────────────────────────────────────────────
     Once on load, once per resize, and never inside a frame. */

  function measure() {
    store.vh = global.innerHeight;
    store.vw = global.innerWidth;

    function box(n) {
      if (!n) return { top: 0, h: 1 };
      var r = n.getBoundingClientRect();
      return { top: r.top + global.scrollY, h: r.height };
    }
    var a = box(heroSection), b = box(menuSection), c = box(placeSection);
    layout.heroTop = a.top; layout.heroH = a.h;
    layout.menuTop = b.top; layout.menuH = b.h;
    layout.placeTop = c.top; layout.placeH = c.h;

    if (heroStage && heroStage.ok) {
      var hr = heroCanvas.getBoundingClientRect();
      heroStage.resize(hr.width, hr.height);
    }
    if (dishStage && dishStage.ok) {
      var dr = dishCanvas.getBoundingClientRect();
      dishStage.resize(dr.width, dr.height);
    }
    if (heroPlate) heroPlate.relayout();
    if (dishPlate) dishPlate.relayout();
    if (menu) menu.measure();
    if (nav) nav.measure();
    if (map) map.measure();
    wake();
  }

  /* ── the stages ──────────────────────────────────────────── */

  function buildStages() {
    var opts = { tier: tier };

    heroStage = new SHRIM.Stage(heroCanvas, opts);
    if (!heroStage.ok) {
      /* No WebGL2 at all: the hero falls back to its poster and so
         does the stage in the menu. */
      root.classList.add('no-webgl', 'no-dish');
      return false;
    }
    heroStage.onLost = function () { root.classList.add('no-webgl', 'no-dish'); };
    heroPlate = new SHRIM.Plate(heroStage, { reduced: reduced, azimuth: -0.30 });
    heroPlate.load(SHRIM.DISHES[0]);

    dishStage = new SHRIM.Stage(dishCanvas, opts);
    if (!dishStage.ok) {
      /* The hero got a context and the menu did not — a driver out
         of contexts, most likely. Only the menu falls back; adding
         `no-webgl` here would drop a poster over a hero that is
         rendering perfectly well underneath it. */
      root.classList.add('no-dish');
      return true;
    }
    dishStage.onLost = function () { root.classList.add('no-dish'); };
    dishPlate = new SHRIM.Plate(dishStage, { reduced: reduced });
    return true;
  }

  /* ── the frame ───────────────────────────────────────────── */

  function frame(t, manual) {
    var dt = Math.min((t - lastT) / 1000, 0.05) || 0.016;
    lastT = t;
    frames++;
    store.y = global.scrollY || global.pageYOffset || 0;

    if (nav) nav.frame();
    if (reveals) reveals.frame();
    if (cursor) cursor.frame(dt);

    var work = false;

    /* ── the hero ────────────────────────────────────────────
       Culled the moment its section leaves the viewport. Below
       the fold, the most expensive thing on this page is not
       running at all. */
    if (heroStage && heroStage.ok) {
      var hVis = store.y < layout.heroTop + layout.heroH + 80;
      if (hVis) {
        work = true;
        var t0 = now();
        /* the scroll pushes the camera in and tilts it up, which
           hands the hero over to the page rather than cutting */
        var p = M.sat(store.y / Math.max(layout.heroH, 1));
        var wide = store.vw >= 900;
        /* the hero answers the pointer too, at about half the
           strength the menu stage does — it is scenery there, not
           an object being examined */
        heroPlate.pointer[0] = store.nx * 0.5;
        heroPlate.pointer[1] = -store.ny * 0.22;
        /* The menu's cameras are framed for a 4:3 panel. A hero is
           a 16:9 one, and a vertical field of view does not care
           how wide the window is — the same camera that fills a
           menu card crops a platter off both edges of a laptop.
           The hero sits a good deal further back, and it slides
           the frame left so the dish clears the words instead of
           being set behind them. */
        /* How far the dish sits to the right, and how far back, both
           follow how much of the window the copy is taking. At
           1440 the words are a third of the width and the platter
           has room beside them; at 1000 they are half of it, and a
           framing tuned on a large laptop puts the headline
           through the middle of the plate. One number, measured
           off the viewport, does both. */
        var tight = M.sat((1440 - store.vw) / 540);
        var scene = heroPlate.update(dt, {
          targetX: wide ? -(0.52 + tight * 0.42) : 0,
          frameY: wide ? 0 : 0.46,
          height: (wide ? 0.62 : 0) + p * 0.55,
          distMul: (wide ? 1.28 + tight * 0.24 : 1.0) * (1 - p * 0.07),
          azimuth: p * 0.30,
          fade: 1 - M.smoothstep(0.55, 1, p),
          exposureMul: 1 - p * 0.12,
          vignetteMul: 1.28,
          fogMul: 1.35,
          steamMul: 1 - p * 0.7
        });
        heroStage.render(scene, dt);
        heroStage.measure(now() - t0);
      }
    }

    /* ── the menu ────────────────────────────────────────── */
    if (dishStage && dishStage.ok && menu) {
      var mTop = layout.menuTop, mBot = layout.menuTop + layout.menuH;
      var mVis = store.y + store.vh > mTop - 100 && store.y < mBot + 100;
      if (mVis) {
        work = true;
        var t1 = now();
        var st = menu.frame(dt);
        dishPlate.pointer[0] = store.nx;
        dishPlate.pointer[1] = -store.ny * 0.4;
        var dscene = dishPlate.update(dt, { fade: st.fade, azimuth: st.azimuth });
        dishStage.render(dscene, dt);
        dishStage.measure(now() - t1);
      }
    }

    /* ── the map ─────────────────────────────────────────── */
    if (map) {
      var pVis = store.y + store.vh > layout.placeTop && store.y < layout.placeTop + layout.placeH;
      if (pVis) map.start();
      map.frame(dt);
    }

    if (!booted && work) {
      booted = true;
      finishBoot();
    }

    if (manual) return;
    if (work || now() < wakeUntil) {
      global.requestAnimationFrame(frame);
    } else {
      running = false;
    }
  }

  function start() {
    if (running) return;
    running = true;
    lastT = now();
    global.requestAnimationFrame(frame);
  }

  /* ── the entrance ────────────────────────────────────────────
     About a second, and there is nothing being waited for in it.
     The card is over a hero that has already been rendered; it
     leaves as soon as there is a frame on screen, or after 550 ms
     if the GPU is slow to hand one over, whichever is first. */

  function finishBoot() {
    if (root.classList.contains('is-booting')) {
      root.classList.remove('is-booting');
      global.setTimeout(function () {
        var b = $('#boot');
        if (b && b.parentNode) b.parentNode.removeChild(b);
      }, 700);
    }
  }

  /* ── listeners ───────────────────────────────────────────────
     All of them park a number. */

  function listen() {
    global.addEventListener('scroll', function () { wake(); }, { passive: true });

    var rt = null;
    global.addEventListener('resize', function () {
      if (rt) global.clearTimeout(rt);
      rt = global.setTimeout(measure, 140);
      wake();
    }, { passive: true });

    global.addEventListener('pointermove', function (e) {
      store.px = e.clientX; store.py = e.clientY;
      store.nx = (e.clientX / store.vw) * 2 - 1;
      store.ny = (e.clientY / store.vh) * 2 - 1;
      wake(900);
    }, { passive: true });

    doc.addEventListener('pointerdown', function () { wake(1400); }, { passive: true });
    doc.addEventListener('click', function () { wake(1800); }, { passive: true });
    doc.addEventListener('keydown', function () { wake(1200); });

    doc.addEventListener('visibilitychange', function () {
      if (!doc.hidden) { lastT = now(); wake(); }
    });

    /* Someone can turn reduced motion on without reloading the
       page, and on a page whose main feature is motion that is
       exactly the moment they most want it respected. */
    var mq = global.matchMedia('(prefers-reduced-motion: reduce)');
    var onMotion = function () {
      reduced = mq.matches;
      root.setAttribute('data-motion', reduced ? 'off' : 'on');
      if (heroPlate) heroPlate.reduced = reduced;
      if (dishPlate) dishPlate.reduced = reduced;
      wake();
    };
    if (mq.addEventListener) mq.addEventListener('change', onMotion);
    else if (mq.addListener) mq.addListener(onMotion);
  }

  /* ── go ──────────────────────────────────────────────────── */

  function init() {
    /* the hero copy rises in sequence, one beat behind the image */
    var seq = $$('.hero__copy > *');
    seq.forEach(function (n, i) { n.style.setProperty('--d', (140 + i * 70) + 'ms'); });
    var rail = $('.hero__rail');
    if (rail) rail.style.setProperty('--d', (140 + seq.length * 70) + 'ms');

    var haveGL = buildStages();

    nav = Site.Nav(store);
    reveals = Site.Reveals(store);
    cursor = Site.Cursor(store);
    map = Site.Map($('#mapcanvas'));
    Site.Directions();
    Site.Book();

    if (haveGL && dishStage && dishStage.ok) {
      menu = Site.Menu({ plate: dishPlate, canvas: dishCanvas });
    } else {
      /* Without WebGL2 the index still has to work: it drives the
         detail panel, which is where the recipe actually lives.
         Nothing on this page is available only to someone who can
         see a canvas. */
      buildFallbackIndex();
    }

    listen();
    measure();
    start();

    /* A handle on the running page. `__shrim.frames` is what the
       loop has actually drawn, `__shrim.ms` what the last forty-
       five frames of each stage averaged, and `seek` jumps a dish
       open or shut without touching the DOM. Kept in the shipped
       file deliberately: the first thing anyone needs when this
       page misbehaves is to know whether the loop is still
       running, and that is not something you can see by looking. */
    global.__shrim = {
      store: store, layout: layout, tier: tier,
      reveals: function () { return reveals; },
      hero: function () { return heroStage; },
      dish: function () { return dishStage; },
      get running() { return running; },
      get frames() { return frames; },
      get ms() {
        return {
          hero: heroStage && heroStage.ok ? +heroStage.frameMs.toFixed(2) : null,
          dish: dishStage && dishStage.ok ? +dishStage.frameMs.toFixed(2) : null,
          scale: heroStage && heroStage.ok ? +heroStage.scale.toFixed(2) : null
        };
      },
      select: function (i) { if (menu) menu.select(i); wake(3000); },
      wake: wake,
      /* Step the loop by hand, at a fixed timestep and without
         rescheduling. Nothing on the page uses it; it exists so
         that the rendering can be driven deterministically from
         outside — a software rasteriser takes seconds a frame, and
         "wait and hope" is not a way to check that a dish came
         apart correctly. */
      tick: function (n, ms) {
        for (var k = 0; k < (n || 1); k++) frame(lastT + (ms || 16), true);
      }
    };

    /* If the GPU never hands back a frame — or there is no GPU —
       the entrance still has to end. */
    global.setTimeout(finishBoot, 550);
  }

  /* the index and detail panel, without a stage behind them */
  function buildFallbackIndex() {
    var index = $('#index'), detail = $('#detail');
    if (!index) return;
    var el = Site.el;
    var inner = el('div', 'detail__inner');
    var meta = el('p', 'detail__meta'), copy = el('p', 'detail__copy');
    var label = el('p', 'detail__label', 'What is in it');
    var parts = el('ul', 'parts'), all = el('p', 'detail__allergens');
    [meta, copy, label, parts, all].forEach(function (n) { inner.appendChild(n); });
    detail.appendChild(inner);

    var rows = [];
    function paint(d, i) {
      rows.forEach(function (r, k) { r.classList.toggle('is-on', k === i); });
      meta.textContent = '';
      [d.sub, d.serves, '£' + d.price].forEach(function (t) { meta.appendChild(el('span', null, t)); });
      copy.textContent = d.copy;
      all.textContent = 'Allergens · ' + d.allergens;
      parts.textContent = '';
      d.ingredients.forEach(function (gg) {
        var li = el('li');
        li.appendChild(el('b', null, gg.label));
        li.appendChild(el('span', null, ' ' + gg.note));
        li.classList.add('is-in');
        parts.appendChild(li);
      });
    }
    SHRIM.DISHES.forEach(function (d, i) {
      var li = el('li'), b = el('button', 'dish');
      b.type = 'button';
      b.appendChild(el('span', 'dish__no', d.no));
      b.appendChild(el('span', 'dish__name', d.name));
      b.appendChild(el('span', 'dish__price', d.price));
      b.appendChild(el('p', 'dish__line', d.line));
      b.addEventListener('click', function () { paint(d, i); });
      li.appendChild(b); index.appendChild(li); rows.push(b);
    });
    paint(SHRIM.DISHES[0], 0);
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();

})(window);
