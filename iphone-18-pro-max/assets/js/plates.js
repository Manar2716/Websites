/* ═══════════════════════════════════════════════════════════════════
   plates.js — the photography.

   IMPORTANT, and stated on the slide as well as here: these are not
   camera samples. There is no photograph anywhere in this repository.
   Each plate is a lighting situation drawn from gradients and blurred
   discs on a 2D canvas — a sunlit scene, a room lit through one
   window, a street after dark. They illustrate *what the light is
   doing* in each situation the speaker describes. Passing a rendered
   gradient off as an iPhone photo would be a lie, so the deck labels
   them and the script says it out loud.

   Each plate is drawn once per resize, never per frame.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var U = global.KN.U;

  function fit(cv) {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = cv.clientWidth || global.innerWidth;
    var h = cv.clientHeight || global.innerHeight;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  /* A defocused highlight: the bright disc with a brighter rim that
     real out-of-focus points of light have, rather than a plain blob. */
  function bokeh(ctx, x, y, r, rgb, a) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0,   'rgba(' + rgb + ',' + (a * .55) + ')');
    g.addColorStop(.62, 'rgba(' + rgb + ',' + (a * .42) + ')');
    g.addColorStop(.88, 'rgba(' + rgb + ',' + (a * .85) + ')');
    g.addColorStop(1,   'rgba(' + rgb + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  }

  function grad(ctx, x0, y0, x1, y1, stops) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    return g;
  }

  /* A seeded shuffle so every reload draws the identical frame — a
     keynote that looks different on the second rehearsal is a bug. */
  function rnd(seed) {
    var s = seed;
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  /* ── 1. bright, direct sun ─────────────────────────────────────── */
  function sun(cv) {
    var f = fit(cv), ctx = f.ctx, w = f.w, h = f.h, R = rnd(7);

    ctx.fillStyle = grad(ctx, 0, 0, 0, h, [
      [0, '#2b3f63'], [.34, '#7d7f93'], [.58, '#d8a878'], [.74, '#e8c79a'], [1, '#c98f5e']
    ]);
    ctx.fillRect(0, 0, w, h);

    /* the sun, low and hard */
    var sx = w * .70, sy = h * .56;
    var g = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * .46);
    g.addColorStop(0, 'rgba(255,250,235,.98)');
    g.addColorStop(.06, 'rgba(255,238,200,.82)');
    g.addColorStop(.22, 'rgba(255,214,150,.30)');
    g.addColorStop(.52, 'rgba(255,190,120,.09)');
    g.addColorStop(1, 'rgba(255,180,110,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    /* dunes: each ridge is a bezier, lit on the sun side and dropping
       into shadow on the other — the whole read of the scene is that
       one edge is blown-bright and the shadow still holds detail */
    var ridges = [
      { y: .60, amp: .050, lo: '#8a5a33', hi: '#e6b783', a: 1 },
      { y: .70, amp: .062, lo: '#6b4126', hi: '#d09660', a: 1 },
      { y: .82, amp: .070, lo: '#472a18', hi: '#a56c3f', a: 1 },
      { y: .96, amp: .055, lo: '#2b1a0f', hi: '#5d3a21', a: 1 }
    ];
    ridges.forEach(function (rg, i) {
      var base = h * rg.y, amp = h * rg.amp;
      ctx.beginPath();
      ctx.moveTo(-10, base);
      var seg = 4;
      for (var k = 0; k <= seg; k++) {
        var x0 = (w / seg) * k, x1 = (w / seg) * (k + 1);
        var cy = base + Math.sin(k * 1.7 + i * 2.1) * amp;
        ctx.quadraticCurveTo(x0 + (x1 - x0) * .5, cy, x1, base + Math.sin((k + 1) * 1.7 + i * 2.1) * amp * .6);
      }
      ctx.lineTo(w + 10, h + 10); ctx.lineTo(-10, h + 10); ctx.closePath();
      ctx.fillStyle = grad(ctx, w * .95, base - amp, w * .1, base + amp * 2, [
        [0, rg.hi], [.42, rg.lo], [1, rg.lo]
      ]);
      ctx.fill();
    });

    /* heat haze along the horizon */
    ctx.fillStyle = grad(ctx, 0, h * .52, 0, h * .66,
      [[0, 'rgba(255,225,190,0)'], [.5, 'rgba(255,225,190,.20)'], [1, 'rgba(255,225,190,0)']]);
    ctx.fillRect(0, h * .52, w, h * .16);
  }

  /* ── 2. indoors, one window ────────────────────────────────────── */
  function indoor(cv) {
    var f = fit(cv), ctx = f.ctx, w = f.w, h = f.h;

    ctx.fillStyle = grad(ctx, w * .2, 0, w, h, [[0, '#262019'], [.5, '#15110d'], [1, '#0a0806']]);
    ctx.fillRect(0, 0, w, h);

    /* the window itself, blown out, and the wedge of light it throws */
    var wx = w * .13, wy = h * .12, ww = w * .27, wh = h * .52;
    ctx.save();
    ctx.filter = 'blur(2px)';
    ctx.fillStyle = grad(ctx, wx, wy, wx + ww, wy + wh,
      [[0, 'rgba(255,248,232,.97)'], [1, 'rgba(226,232,240,.80)']]);
    ctx.fillRect(wx, wy, ww, wh);
    ctx.restore();

    /* mullion */
    ctx.fillStyle = 'rgba(30,24,18,.62)';
    ctx.fillRect(wx + ww * .48, wy, 5, wh);
    ctx.fillRect(wx, wy + wh * .42, ww, 5);

    /* spill: a soft cone widening into the room */
    ctx.save();
    ctx.filter = 'blur(40px)';
    ctx.beginPath();
    ctx.moveTo(wx, wy); ctx.lineTo(wx + ww, wy);
    ctx.lineTo(w * .92, h * .96); ctx.lineTo(wx * .3, h * .96);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,238,208,.17)';
    ctx.fill();
    ctx.restore();

    /* a table plane catching the light, and one object on it */
    ctx.fillStyle = grad(ctx, 0, h * .70, 0, h, [[0, '#3a2c1e'], [1, '#120d08']]);
    ctx.fillRect(0, h * .70, w, h * .30);
    ctx.fillStyle = grad(ctx, wx, 0, w * .8, 0,
      [[0, 'rgba(255,236,200,.30)'], [1, 'rgba(255,236,200,0)']]);
    ctx.fillRect(0, h * .70, w, h * .08);

    ctx.save();
    ctx.filter = 'blur(1.5px)';
    var cx = w * .56, cy = h * .70;
    ctx.fillStyle = grad(ctx, cx - 40, cy - 120, cx + 40, cy,
      [[0, 'rgba(236,226,208,.92)'], [.5, 'rgba(150,138,120,.9)'], [1, 'rgba(60,52,42,.9)']]);
    ctx.beginPath();
    ctx.moveTo(cx - 34, cy); ctx.lineTo(cx - 26, cy - 118);
    ctx.lineTo(cx + 26, cy - 118); ctx.lineTo(cx + 34, cy);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.save(); ctx.filter = 'blur(12px)';
    ctx.beginPath(); ctx.ellipse(cx + 54, cy + 6, 78, 11, 0, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  /* ── 3. after dark ─────────────────────────────────────────────── */
  function night(cv) {
    var f = fit(cv), ctx = f.ctx, w = f.w, h = f.h, R = rnd(31);

    ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, '#04060f'], [.55, '#0a1024'], [1, '#141020']]);
    ctx.fillRect(0, 0, w, h);

    /* skyline: plain rectangles, but with lit windows, which is what
       actually sells a city at night */
    var x = -20, seed = 3;
    while (x < w + 20) {
      var bw = 46 + R() * 96, bh = h * (.20 + R() * .30);
      var by = h * .72 - bh;
      ctx.fillStyle = 'rgba(6,8,16,.96)';
      ctx.fillRect(x, by, bw, bh + h * .3);
      for (var wy = by + 12; wy < h * .70; wy += 17) {
        for (var wx = x + 8; wx < x + bw - 10; wx += 14) {
          if (R() > .58) {
            ctx.fillStyle = 'rgba(255,' + (200 + Math.floor(R() * 40)) + ',' +
                            (140 + Math.floor(R() * 60)) + ',' + (.22 + R() * .5) + ')';
            ctx.fillRect(wx, wy, 6, 8);
          }
        }
      }
      x += bw + 6 + R() * 14;
    }

    /* glow pooling above the street */
    ctx.fillStyle = grad(ctx, 0, h * .40, 0, h * .78,
      [[0, 'rgba(255,170,90,0)'], [1, 'rgba(255,170,90,.16)']]);
    ctx.fillRect(0, h * .40, w, h * .38);

    /* defocused street lights in the near foreground */
    var lamps = [
      [w * .12, h * .84, 72, '255,186,110', .55], [w * .30, h * .90, 54, '255,206,140', .45],
      [w * .52, h * .80, 96, '255,170,96',  .40], [w * .74, h * .88, 64, '180,206,255', .42],
      [w * .90, h * .82, 80, '255,150,120', .38], [w * .42, h * .95, 44, '255,226,180', .5],
      [w * .64, h * .94, 58, '150,190,255', .34], [w * .04, h * .94, 50, '255,196,130', .4]
    ];
    lamps.forEach(function (l) { bokeh(ctx, l[0], l[1], l[2], l[3], l[4]); });

    /* wet ground reflecting it back */
    ctx.fillStyle = grad(ctx, 0, h * .72, 0, h,
      [[0, 'rgba(255,180,110,.10)'], [1, 'rgba(10,14,30,.85)']]);
    ctx.fillRect(0, h * .72, w, h * .28);
  }

  /* ── 4. a long way off ─────────────────────────────────────────── */
  function far(cv) {
    var f = fit(cv), ctx = f.ctx, w = f.w, h = f.h;

    ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, '#151d2c'], [.5, '#2d3a4e'], [1, '#54647a']]);
    ctx.fillRect(0, 0, w, h);

    /* Four ridges, each paler than the last. Aerial perspective is the
       whole subject of this plate: distance is haze, and holding
       detail through it is the thing a long lens has to do. */
    var bands = [
      { y: .50, a: '#39465c', amp: .05 },
      { y: .62, a: '#2b3648', amp: .06 },
      { y: .76, a: '#1c2430', amp: .07 },
      { y: .92, a: '#101620', amp: .05 }
    ];
    bands.forEach(function (b, i) {
      var base = h * b.y, amp = h * b.amp;
      ctx.beginPath(); ctx.moveTo(-10, base);
      for (var k = 0; k <= 6; k++) {
        var x0 = (w / 6) * k;
        ctx.lineTo(x0, base + Math.sin(k * 1.3 + i * 1.9) * amp - Math.cos(k * .7) * amp * .5);
      }
      ctx.lineTo(w + 10, h + 10); ctx.lineTo(-10, h + 10); ctx.closePath();
      ctx.fillStyle = b.a; ctx.fill();
      /* haze sitting in front of each ridge */
      ctx.fillStyle = grad(ctx, 0, base - amp, 0, base + amp * 2.2,
        [[0, 'rgba(150,175,205,.24)'], [1, 'rgba(150,175,205,0)']]);
      ctx.fillRect(0, base - amp * 1.4, w, amp * 4);
    });

    /* the distant subject — small, and deliberately still crisp */
    var bx = w * .615, by = h * .615;
    ctx.fillStyle = 'rgba(14,18,26,.95)';
    ctx.fillRect(bx, by - h * .075, w * .012, h * .075);
    ctx.fillRect(bx - w * .013, by - h * .044, w * .012, h * .044);
    ctx.fillStyle = 'rgba(255,228,180,.85)';
    ctx.fillRect(bx + w * .003, by - h * .062, w * .004, h * .008);

    ctx.fillStyle = grad(ctx, 0, h * .55, 0, h * .72,
      [[0, 'rgba(190,210,235,.16)'], [1, 'rgba(190,210,235,0)']]);
    ctx.fillRect(0, h * .55, w, h * .2);
  }

  /* ── 5. a person ───────────────────────────────────────────────── */
  function portrait(cv) {
    var f = fit(cv), ctx = f.ctx, w = f.w, h = f.h;

    ctx.fillStyle = grad(ctx, 0, 0, w, h, [[0, '#1a1622'], [.6, '#241c26'], [1, '#0d0b10']]);
    ctx.fillRect(0, 0, w, h);

    /* background lights, thrown well out of focus — the point of the
       plate is the falloff between the subject and everything behind */
    var pts = [
      [w * .18, h * .30, 86, '255,186,120', .40], [w * .34, h * .16, 62, '255,214,160', .34],
      [w * .72, h * .24, 104, '160,180,255', .30], [w * .86, h * .44, 74, '255,160,140', .34],
      [w * .62, h * .12, 54, '255,230,190', .38], [w * .08, h * .58, 68, '200,160,255', .24],
      [w * .92, h * .14, 58, '255,200,150', .30], [w * .48, h * .22, 46, '255,240,210', .3]
    ];
    ctx.save(); ctx.filter = 'blur(6px)';
    pts.forEach(function (p) { bokeh(ctx, p[0], p[1], p[2], p[3], p[4]); });
    ctx.restore();

    /* key light from the left */
    var kx = w * .30, ky = h * .30;
    var kg = ctx.createRadialGradient(kx, ky, 0, kx, ky, h * .8);
    kg.addColorStop(0, 'rgba(255,226,190,.18)');
    kg.addColorStop(1, 'rgba(255,226,190,0)');
    ctx.fillStyle = kg; ctx.fillRect(0, 0, w, h);

    /* the subject: head and shoulders, rim-lit, held sharp against the
       soft ground behind */
    var cx = w * .50, chin = h * .72, hr = h * .155;
    ctx.save();
    /* shoulders */
    ctx.fillStyle = grad(ctx, cx - hr * 2, chin, cx + hr * 2, h,
      [[0, '#3b2c26'], [.5, '#241a17'], [1, '#14100e']]);
    ctx.beginPath();
    ctx.moveTo(cx - hr * 3.1, h + 10);
    ctx.quadraticCurveTo(cx - hr * 2.5, chin + hr * .18, cx - hr * .96, chin + hr * .02);
    ctx.lineTo(cx + hr * .96, chin + hr * .02);
    ctx.quadraticCurveTo(cx + hr * 2.5, chin + hr * .18, cx + hr * 3.1, h + 10);
    ctx.closePath(); ctx.fill();

    /* head */
    ctx.fillStyle = grad(ctx, cx - hr, chin - hr * 2.1, cx + hr * .9, chin,
      [[0, '#c69a78'], [.46, '#8d6752'], [1, '#3d2c24']]);
    ctx.beginPath();
    ctx.ellipse(cx, chin - hr * 1.02, hr * .78, hr * 1.04, 0, 0, 6.2832);
    ctx.fill();

    /* hair */
    ctx.fillStyle = '#1b1310';
    ctx.beginPath();
    ctx.ellipse(cx, chin - hr * 1.42, hr * .84, hr * .72, 0, Math.PI, 6.2832);
    ctx.fill();

    /* rim light down the right edge — the cue that reads as "lit", and
       the hardest thing for a phone to keep clean */
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = grad(ctx, cx + hr * .3, 0, cx + hr * .95, 0,
      [[0, 'rgba(255,208,170,0)'], [1, 'rgba(255,214,176,.50)']]);
    ctx.beginPath();
    ctx.ellipse(cx, chin - hr * 1.02, hr * .78, hr * 1.04, 0, 0, 6.2832);
    ctx.fill();
    ctx.restore();

    /* vignette to seat the subject */
    var vg = ctx.createRadialGradient(cx, chin - hr, h * .12, cx, chin - hr, h * .92);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.66)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  }

  /* ── 6. moving ─────────────────────────────────────────────────── */
  function motion(cv) {
    var f = fit(cv), ctx = f.ctx, w = f.w, h = f.h, R = rnd(59);

    ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, '#070a14'], [.6, '#101828'], [1, '#05070d']]);
    ctx.fillRect(0, 0, w, h);

    /* light streaks: the classic long-exposure read, used here because
       the subject of the plate is movement being held steady */
    ctx.save();
    for (var i = 0; i < 16; i++) {
      var y = h * (.30 + R() * .52);
      var len = w * (.26 + R() * .62);
      var x0 = -w * .1 + R() * w * .9;
      var th = 2 + R() * 7;
      var warm = R() > .45;
      ctx.filter = 'blur(' + (2 + R() * 5).toFixed(1) + 'px)';
      ctx.fillStyle = grad(ctx, x0, 0, x0 + len, 0, [
        [0, 'rgba(255,255,255,0)'],
        [.42, warm ? 'rgba(255,186,120,.44)' : 'rgba(150,190,255,.36)'],
        [.7, warm ? 'rgba(255,228,190,.30)' : 'rgba(200,220,255,.26)'],
        [1, 'rgba(255,255,255,0)']
      ]);
      ctx.fillRect(x0, y, len, th);
    }
    ctx.restore();

    /* horizon holding still while everything else travels */
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(0, h * .74, w, h * .26);
    ctx.fillStyle = grad(ctx, 0, h * .72, 0, h * .78,
      [[0, 'rgba(160,190,255,0)'], [.5, 'rgba(160,190,255,.22)'], [1, 'rgba(160,190,255,0)']]);
    ctx.fillRect(0, h * .72, w, h * .06);

    /* cinema bars */
    ctx.fillStyle = '#000';
    var bar = h * .085;
    ctx.fillRect(0, 0, w, bar); ctx.fillRect(0, h - bar, w, bar);
  }

  var PAINT = { sun: sun, indoor: indoor, night: night, far: far, portrait: portrait, motion: motion };

  function mount(root) {
    var made = {};
    Object.keys(PAINT).forEach(function (k) {
      var p = document.createElement('div');
      p.className = 'plate';
      p.dataset.plate = k;
      var cv = document.createElement('canvas');
      p.appendChild(cv);
      root.appendChild(p);
      made[k] = { node: p, canvas: cv, paint: PAINT[k], drawn: false };
    });

    function draw(k) {
      var m = made[k];
      if (!m) return;
      m.paint(m.canvas);
      m.drawn = true;
    }

    /* Paint lazily — the first plate is not needed until slide 4, and
       drawing six full-viewport canvases at boot is the kind of thing
       that shows up as a stutter on the opening reveal. */
    function show(k) {
      Object.keys(made).forEach(function (j) {
        if (j !== k) made[j].node.classList.remove('is-on');
      });
      if (!k) return;
      if (!made[k].drawn) draw(k);
      /* force a reflow so the scale transition restarts on re-entry */
      void made[k].node.offsetWidth;
      made[k].node.classList.add('is-on');
    }

    var rt;
    global.addEventListener('resize', function () {
      global.clearTimeout(rt);
      rt = global.setTimeout(function () {
        Object.keys(made).forEach(function (k) { if (made[k].drawn) made[k].paint(made[k].canvas); });
      }, 200);
    });

    return { show: show, all: made };
  }

  global.KN.Plates = { mount: mount };
})(window);
