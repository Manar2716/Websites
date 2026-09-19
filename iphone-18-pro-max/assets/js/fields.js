/* ═══════════════════════════════════════════════════════════════════
   fields.js — the camera sequence.

   These are NOT photographs and they are not trying to look like any.
   No real sample images were available to this project, and drawing a
   scene that could pass for one would be a lie told in the middle of a
   deck about a camera. So each of the six is an abstract study of the
   LIGHT in a situation — the hard white of midday, the warm wedge of a
   window, the scattered points of a street after dark — with no object,
   place or person depicted. The frame carries a label saying so while
   they are on screen, and the speaker says it out loud.

   Each field is painted once per resize, never per frame.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function fit(cv) {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = cv.clientWidth || global.innerWidth;
    var h = cv.clientHeight || global.innerHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  function lin(ctx, x0, y0, x1, y1, stops) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    return g;
  }
  function rad(ctx, x, y, r0, r1, stops) {
    var g = ctx.createRadialGradient(x, y, r0, x, y, r1);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    return g;
  }
  /* a defocused point of light: bright core, brighter rim */
  function disc(ctx, x, y, r, rgb, a) {
    ctx.fillStyle = rad(ctx, x, y, 0, r, [
      [0, 'rgba(' + rgb + ',' + a * .5 + ')'],
      [.64, 'rgba(' + rgb + ',' + a * .38 + ')'],
      [.89, 'rgba(' + rgb + ',' + a * .8 + ')'],
      [1, 'rgba(' + rgb + ',0)']
    ]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  }
  /* deterministic, so every rehearsal draws the identical frame */
  function rnd(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

  /* ── 1 · direct sun ── high key, one hard source, deep falloff ── */
  function bright(cv) {
    var f = fit(cv), c = f.ctx, w = f.w, h = f.h;
    c.fillStyle = lin(c, 0, 0, w * .3, h, [[0, '#f2ead9'], [.42, '#d9c39c'], [1, '#6d5738']]);
    c.fillRect(0, 0, w, h);
    c.fillStyle = rad(c, w * .72, h * .3, 0, h * .95, [
      [0, 'rgba(255,255,252,.98)'], [.1, 'rgba(255,248,226,.72)'],
      [.34, 'rgba(255,226,170,.24)'], [1, 'rgba(255,200,130,0)']]);
    c.fillRect(0, 0, w, h);
    /* the shadow side, which is the actual subject of this one */
    c.fillStyle = lin(c, 0, h, w * .55, h * .2, [
      [0, 'rgba(24,16,8,.72)'], [1, 'rgba(24,16,8,0)']]);
    c.fillRect(0, 0, w, h);
  }

  /* ── 2 · one window ── a warm wedge across a cool dark room ── */
  function indoor(cv) {
    var f = fit(cv), c = f.ctx, w = f.w, h = f.h;
    c.fillStyle = lin(c, w, 0, 0, h, [[0, '#2b2219'], [.55, '#17130f'], [1, '#0a0806']]);
    c.fillRect(0, 0, w, h);

    /* the source, off frame to the left, and the wedge it throws */
    c.fillStyle = rad(c, w * .06, h * .3, 0, h * 1.1, [
      [0, 'rgba(255,244,222,.62)'], [.16, 'rgba(255,236,202,.26)'],
      [.46, 'rgba(255,222,180,.08)'], [1, 'rgba(255,214,170,0)']]);
    c.fillRect(0, 0, w, h);

    c.save();
    c.filter = 'blur(46px)';
    c.beginPath();
    c.moveTo(0, h * .06); c.lineTo(w * .30, h * .02);
    c.lineTo(w * .96, h * .92); c.lineTo(0, h * .82);
    c.closePath();
    c.fillStyle = 'rgba(255,236,206,.15)';
    c.fill();
    c.restore();

    /* how fast it falls away from the window is the whole subject */
    c.fillStyle = lin(c, w * .2, 0, w, h * .9, [
      [0, 'rgba(6,5,4,0)'], [.62, 'rgba(6,5,4,.52)'], [1, 'rgba(6,5,4,.86)']]);
    c.fillRect(0, 0, w, h);
  }

  /* ── 3 · after dark ── scattered points, almost no ambient ── */
  function night(cv) {
    var f = fit(cv), c = f.ctx, w = f.w, h = f.h, R = rnd(31);
    c.fillStyle = lin(c, 0, 0, 0, h, [[0, '#03050c'], [.6, '#080d1c'], [1, '#0d0a14']]);
    c.fillRect(0, 0, w, h);
    var pts = [
      [.16, .34, 120, '255,176,96', .5], [.38, .62, 86, '255,206,140', .42],
      [.62, .28, 150, '150,186,255', .34], [.82, .56, 104, '255,150,110', .4],
      [.28, .82, 78, '255,226,180', .36], [.7,  .84, 122, '180,200,255', .3],
      [.92, .2,  70, '255,196,130', .34], [.05, .66, 92, '200,160,255', .24]
    ];
    pts.forEach(function (p) { disc(c, w * p[0], h * p[1], p[2], p[3], p[4]); });
    c.fillStyle = rad(c, w * .5, h * .5, h * .2, h * 1.05,
      [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.72)']]);
    c.fillRect(0, 0, w, h);
  }

  /* ── 4 · distance ── stacked haze, contrast falling away ── */
  function distance(cv) {
    var f = fit(cv), c = f.ctx, w = f.w, h = f.h;
    c.fillStyle = lin(c, 0, 0, 0, h, [[0, '#131b28'], [.5, '#33425a'], [1, '#78889c']]);
    c.fillRect(0, 0, w, h);
    for (var i = 0; i < 6; i++) {
      var y = h * (.24 + i * .12);
      c.fillStyle = lin(c, 0, y, 0, y + h * .14, [
        ['0', 'rgba(158,182,212,' + (.05 + i * .045) + ')'],
        [1, 'rgba(158,182,212,0)']]);
      c.fillRect(0, y, w, h * .15);
    }
    c.fillStyle = lin(c, 0, h * .42, 0, h * .62,
      [[0, 'rgba(210,226,244,0)'], [.5, 'rgba(210,226,244,.2)'], [1, 'rgba(210,226,244,0)']]);
    c.fillRect(0, h * .42, w, h * .2);
  }

  /* ── 5 · a subject ── one pool held, everything else falling off ── */
  function subject(cv) {
    var f = fit(cv), c = f.ctx, w = f.w, h = f.h;
    c.fillStyle = lin(c, 0, 0, w, h, [[0, '#1d1823'], [.6, '#261d27'], [1, '#0c0a0f']]);
    c.fillRect(0, 0, w, h);
    var pts = [[.2,.26,110,'255,186,120',.34], [.76,.2,130,'160,180,255',.26],
               [.86,.5,96,'255,160,140',.3], [.12,.62,86,'200,160,255',.2]];
    c.save(); c.filter = 'blur(10px)';
    pts.forEach(function (p) { disc(c, w * p[0], h * p[1], p[2], p[3], p[4]); });
    c.restore();
    /* the held pool — soft-edged, deliberately not a silhouette */
    c.fillStyle = rad(c, w * .46, h * .52, 0, h * .42, [
      [0, 'rgba(255,228,200,.30)'], [.42, 'rgba(255,214,180,.13)'], [1, 'rgba(255,200,160,0)']]);
    c.fillRect(0, 0, w, h);
    c.fillStyle = rad(c, w * .46, h * .52, h * .16, h * .95,
      [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.74)']]);
    c.fillRect(0, 0, w, h);
  }

  /* ── 6 · movement ── travel held steady ── */
  function movement(cv) {
    var f = fit(cv), c = f.ctx, w = f.w, h = f.h, R = rnd(59);
    c.fillStyle = lin(c, 0, 0, 0, h, [[0, '#06080f'], [.55, '#0e1524'], [1, '#04060b']]);
    c.fillRect(0, 0, w, h);
    c.save();
    for (var i = 0; i < 18; i++) {
      var y = h * (.18 + R() * .68), len = w * (.24 + R() * .66);
      var x0 = -w * .12 + R() * w * .9, th = 2 + R() * 8, warm = R() > .45;
      c.filter = 'blur(' + (2 + R() * 6).toFixed(1) + 'px)';
      c.fillStyle = lin(c, x0, 0, x0 + len, 0, [
        [0, 'rgba(255,255,255,0)'],
        [.44, warm ? 'rgba(255,186,120,.42)' : 'rgba(150,190,255,.34)'],
        [.72, warm ? 'rgba(255,228,190,.26)' : 'rgba(200,220,255,.22)'],
        [1, 'rgba(255,255,255,0)']]);
      c.fillRect(x0, y, len, th);
    }
    c.restore();
    var bar = h * .085;
    c.fillStyle = '#000';
    c.fillRect(0, 0, w, bar); c.fillRect(0, h - bar, w, bar);
  }

  var PAINT = { bright: bright, indoor: indoor, night: night,
                distance: distance, subject: subject, movement: movement };

  function mount(root) {
    var made = {};
    Object.keys(PAINT).forEach(function (k) {
      var p = document.createElement('div');
      p.className = 'plate'; p.dataset.plate = k;
      var cv = document.createElement('canvas');
      p.appendChild(cv); root.appendChild(p);
      made[k] = { node: p, canvas: cv, paint: PAINT[k], drawn: false };
    });

    function show(k) {
      Object.keys(made).forEach(function (j) {
        if (j !== k) made[j].node.classList.remove('is-on');
      });
      if (!k) return;
      var m = made[k];
      /* painted on first use: six full-viewport canvases at boot shows
         up as a stutter on the opening reveal */
      if (!m.drawn) { m.paint(m.canvas); m.drawn = true; }
      void m.node.offsetWidth;
      m.node.classList.add('is-on');
    }

    var rt;
    global.addEventListener('resize', function () {
      global.clearTimeout(rt);
      rt = global.setTimeout(function () {
        Object.keys(made).forEach(function (k) {
          if (made[k].drawn) made[k].paint(made[k].canvas);
        });
      }, 200);
    });

    return { show: show };
  }

  global.KN.Fields = { mount: mount };
})(window);
