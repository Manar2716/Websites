/* ═══════════════════════════════════════════════════════════
   scene.js — everything you look at, generated at runtime.
   No photographs, no sprite sheets: the grove, the spore field,
   the machine and the spools are all built from vectors and
   gradients so they stay sharp on a 4K panel and cost nothing
   to download.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var CORE = global.CORE, U = CORE.U, S = CORE.S;

  /* deterministic RNG — the grove looks hand-placed but is
     identical on every load, so layout never surprises us */
  function rng(seed) {
    var s = seed >>> 0 || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5;  s >>>= 0;
      return s / 4294967296;
    };
  }

  /* ── 1 · BAMBOO GROVE ─────────────────────────────────────
     Each culm is a div: a cylindrical gradient for the body,
     a repeating gradient for the nodes, and a couple of
     clip-path fronds. Cheap, and resolution-independent. */
  function buildGrove(layer, index) {
    var count = parseInt(layer.dataset.culms, 10) || 6;
    var rand = rng(9871 + index * 7919);
    var narrow = S.vw < 820;
    if (narrow) count = Math.max(3, Math.round(count * 0.55));

    var frag = global.document.createDocumentFragment();

    for (var i = 0; i < count; i++) {
      var culm = global.document.createElement('div');
      culm.className = 'culm';

      /* spread culms across the width with jitter, biased away
         from dead centre so the machine keeps its stage clear */
      var slot = (i + 0.5) / count;
      var jitter = (rand() - 0.5) * (0.85 / count);
      var x = slot + jitter;
      var push = x < 0.5 ? -0.075 : 0.075;
      x = U.clamp(x + push * (1 - Math.abs(x - 0.5) * 2), 0.01, 0.99);

      var w = U.lerp(5, 16, rand()) * (index === 2 ? 1.7 : index === 1 ? 1.15 : 0.8);
      var h = U.lerp(58, 118, rand());
      var lean = (rand() - 0.5) * 5.5;
      var seg = U.lerp(9, 15, rand());

      culm.style.cssText =
        'left:' + (x * 100).toFixed(2) + '%;' +
        'width:' + w.toFixed(1) + 'px;' +
        'height:' + h.toFixed(1) + '%;' +
        '--lean:' + lean.toFixed(2) + 'deg;' +
        '--seg:' + seg.toFixed(1) + '%;' +
        '--sway:' + (U.lerp(5, 11, rand())).toFixed(1) + 's;' +
        'animation-delay:-' + (rand() * 8).toFixed(1) + 's;';

      /* fronds — three per culm, alternating sides, upper third */
      var fronds = 2 + Math.round(rand() * 2);
      for (var f = 0; f < fronds; f++) {
        var frond = global.document.createElement('i');
        frond.className = 'frond';
        var side = f % 2 ? 1 : -1;
        frond.style.cssText =
          'top:' + U.lerp(4, 42, rand()).toFixed(1) + '%;' +
          '--side:' + side + ';' +
          '--len:' + U.lerp(26, 58, rand()).toFixed(0) + 'px;' +
          '--drop:' + U.lerp(12, 34, rand()).toFixed(0) + 'deg;';
        culm.appendChild(frond);
      }

      frag.appendChild(culm);
    }
    layer.textContent = '';
    layer.appendChild(frag);
  }

  /* ── 1b · UNDERGROWTH ─────────────────────────────────────
     Ferns crowding the jungle floor. These live in their own band
     pinned to the bottom of the viewport rather than in the grove
     planes — those travel up to three viewport heights on scroll,
     which would lift ground cover into the canopy. */
  function buildUnderstory(layer) {
    var rand = rng(20260730);
    var narrow = S.vw < 820;
    var count = narrow ? 8 : 20;
    var frag = global.document.createDocumentFragment();

    for (var i = 0; i < count; i++) {
      var fern = global.document.createElement('div');
      fern.className = 'fern';

      var x = ((i + 0.5) / count) + (rand() - 0.5) * (0.9 / count);
      /* depth: the big ones sit forward, and forward means brighter
         and lower in frame */
      var depth = rand();
      var fs = U.lerp(0.65, 1.75, depth) * (narrow ? 0.65 : 1);

      fern.style.cssText =
        'left:' + (x * 100).toFixed(2) + '%;' +
        'bottom:' + (-6 + (1 - depth) * 9).toFixed(1) + '%;' +
        '--fs:' + fs.toFixed(2) + ';' +
        '--flip:' + (rand() > 0.5 ? 1 : -1) + ';' +
        '--fr:' + ((rand() - 0.5) * 30).toFixed(1) + 'deg;' +
        'opacity:' + U.lerp(0.34, 0.88, depth).toFixed(2) + ';' +
        'z-index:' + Math.round(depth * 10) + ';' +
        '--sway:' + U.lerp(7, 14, rand()).toFixed(1) + 's;' +
        'animation-delay:-' + (rand() * 10).toFixed(1) + 's;';

      /* pinnae alternate down the spine, shortening toward the tip */
      var pin = 9 + Math.round(rand() * 5);
      for (var q = 0; q < pin; q++) {
        var f = q / pin;
        var leaflet = global.document.createElement('i');
        leaflet.className = 'pinna';
        leaflet.style.cssText =
          'bottom:' + (8 + f * 84).toFixed(1) + '%;' +
          '--len:' + (1 - f * 0.62).toFixed(2) + ';' +
          '--side:' + (q % 2 ? 1 : -1) + ';' +
          '--pd:' + U.lerp(20, 46, rand()).toFixed(0) + 'deg;';
        fern.appendChild(leaflet);
      }
      frag.appendChild(fern);
    }
    layer.textContent = '';
    layer.appendChild(frag);
  }

  /* ── 2 · SPORE FIELD ──────────────────────────────────────
     Motes drifting up through the light cone. Drawn additively
     so overlaps bloom instead of flattening. */
  function Spores(canvas) {
    var ctx = canvas.getContext('2d', { alpha: true });
    var dpr = 1, w = 0, h = 0, parts = [];

    function resize() {
      /* cap DPR at 2 — beyond that the pixel cost buys nothing
         for out-of-focus dust */
      dpr = Math.min(global.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    }

    function seed() {
      var target = U.clamp(Math.round((w * h) / 16000), 26, S.vw < 820 ? 46 : 130);
      parts.length = 0;
      var rand = rng(4242);
      for (var i = 0; i < target; i++) {
        parts.push({
          x: rand() * w,
          y: rand() * h,
          r: U.lerp(0.5, 2.0, rand()),
          spd: U.lerp(5, 22, rand()),
          sway: U.lerp(0.15, 0.7, rand()),
          phase: rand() * Math.PI * 2,
          a: U.lerp(0.16, 0.7, rand())
        });
      }
    }

    function step(dt, now) {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      var t = now / 1000;
      /* motes ride the scroll a little — sells the parallax */
      var drift = S.velocity * 0.0016;

      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.y -= p.spd * dt;
        p.y += drift;
        if (p.y < -8) { p.y = h + 8; p.x = Math.random() * w; }
        else if (p.y > h + 8) { p.y = -8; p.x = Math.random() * w; }

        var x = p.x + Math.sin(t * p.sway + p.phase) * 16;
        /* brightest in the middle of the cone, fading at the edges */
        var cone = 1 - Math.abs(x / w - 0.5) * 1.5;
        var alpha = p.a * U.clamp(cone, 0.05, 1);

        ctx.beginPath();
        ctx.arc(x, p.y, p.r, 0, 6.2832);
        ctx.fillStyle = 'rgba(196, 226, 132, ' + alpha.toFixed(3) + ')';
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    resize();
    CORE.onResize(resize);
    return { step: step };
  }

  /* ── 3 · THE MACHINE ──────────────────────────────────────
     A real CSS 3D box: five opaque faces, a glass front, corner
     posts, a build plate, and a gantry that rises as the part
     grows. Nothing here is an image. */
  var SLABS = 14;

  function buildPrinter(mount) {
    var pr = global.document.createElement('div');
    pr.className = 'pr';

    /* Modelled on the enclosed CoreXY machines this page is about:
       a sheet-metal cube with one glass door, the control unit at
       the top left of that door, a nameplate top right and the mark
       embossed on the right flank. Painted back-to-front so the
       depth sort has the best chance with the translucent door. */
    var html =
      '<div class="pr__3d">' +
        '<div class="pr__glow"></div>' +
        '<div class="pr__base"></div>' +
        '<div class="pr__face pr__shell pr__face--back"></div>' +
        '<div class="pr__face pr__shell pr__face--left"></div>' +
        '<div class="pr__face pr__shell pr__face--right"></div>' +
        '<div class="pr__face pr__shell pr__face--top"></div>' +
        '<div class="pr__face pr__shell pr__face--bottom"></div>' +
        '<div class="pr__mark">' +
          '<svg viewBox="0 0 32 32" aria-hidden="true">' +
            '<path d="M16 3v26M16 10l8-5M16 18l-8-5M16 26l8-5"/>' +
          '</svg>' +
        '</div>' +
        '<div class="pr__zrail pr__zrail--l"></div>' +
        '<div class="pr__zrail pr__zrail--r"></div>' +
        '<div class="pr__bed"><div class="pr__part">';

    for (var i = 0; i < SLABS; i++) {
      html += '<div class="pr__slab" style="--i:' + (i / (SLABS - 1)).toFixed(4) + '"></div>';
    }

    html +=
        '</div></div>' +
        '<div class="pr__gantry">' +
          '<div class="pr__rail pr__rail--a"></div>' +
          '<div class="pr__rail pr__rail--b"></div>' +
          '<div class="pr__beam">' +
            '<div class="pr__head"><span class="pr__nozzle"></span></div>' +
          '</div>' +
        '</div>' +
        '<div class="pr__foot pr__foot--a"></div>' +
        '<div class="pr__foot pr__foot--b"></div>' +
        '<div class="pr__foot pr__foot--c"></div>' +
        '<div class="pr__foot pr__foot--d"></div>' +
        '<div class="pr__face pr__glass"><span class="pr__sheen"></span></div>' +
        '<div class="pr__ui">' +
          '<span class="pr__screen"><span data-screen>READY</span></span>' +
          '<span class="pr__dial"></span>' +
        '</div>' +
        '<div class="pr__badge">UNDERSTORY<b>CANOPY 01</b></div>' +
        '<div class="pr__oval">UNDERSTORY</div>' +
      '</div>';

    pr.innerHTML = html;
    mount.appendChild(pr);

    return {
      el: pr,
      slabs: pr.querySelectorAll('.pr__slab'),
      screen: pr.querySelector('[data-screen]'),
      /* rx/ry in degrees, gy 0..1, hx/hz -1..1, grow 0..1 */
      set: function (rx, ry, gy, hx, grow, hz) {
        var st = pr.style;
        st.setProperty('--rx', rx.toFixed(2) + 'deg');
        st.setProperty('--ry', ry.toFixed(2) + 'deg');
        st.setProperty('--gy', gy.toFixed(4));
        st.setProperty('--hx', hx.toFixed(4));
        st.setProperty('--hz', (hz || 0).toFixed(4));
        st.setProperty('--grow', grow.toFixed(4));
      },
      /* 1 = solid housing as it ships, 0 = panels dissolved so the
         mechanism underneath can be pointed at */
      shell: function (v) {
        if (v === this._shell) return;
        this._shell = v;
        pr.style.setProperty('--shell', v.toFixed(3));
      },
      _shell: 1,
      /* light up slabs up to `grow` — one class toggle per slab,
         only when it actually changes */
      layers: function (grow) {
        var on = Math.round(grow * SLABS);
        if (on === this._on) return;
        this._on = on;
        for (var i = 0; i < this.slabs.length; i++) {
          var want = i < on;
          if (this.slabs[i]._on !== want) {
            this.slabs[i].classList.toggle('is-on', want);
            this.slabs[i]._on = want;
          }
        }
      },
      _on: -1
    };
  }

  /* ── 4 · FILAMENT SPOOLS ──────────────────────────────────
     Concentric-ring discs that spin as the section scrolls past. */
  function buildSpools(root) {
    var items = root.querySelectorAll('[data-spool] .spool__3d');
    var out = [];
    items.forEach(function (host, i) {
      var disc = global.document.createElement('div');
      disc.className = 'spool__disc';
      disc.innerHTML = '<span class="spool__tail"></span>';
      host.appendChild(disc);
      out.push({ el: disc, offset: i * 0.18, dir: i % 2 ? -1 : 1 });
    });
    return out;
  }

  /* ── 5 · GROWTH (final section) ───────────────────────────
     Bamboo that draws itself upward as you reach the CTA. */
  function buildGrowth(svg) {
    var rand = rng(31337);
    var ns = 'http://www.w3.org/2000/svg';
    var paths = [];
    var n = S.vw < 820 ? 5 : 9;

    for (var i = 0; i < n; i++) {
      var x = ((i + 0.5) / n) * 1200 + (rand() - 0.5) * 60;
      var top = U.lerp(90, 300, rand());
      var bend = (rand() - 0.5) * 90;

      var d = 'M' + x.toFixed(1) + ' 600 C' +
        (x + bend * 0.3).toFixed(1) + ' ' + ((600 + top) / 2).toFixed(1) + ' ' +
        (x + bend).toFixed(1) + ' ' + (top + 120).toFixed(1) + ' ' +
        (x + bend * 0.8).toFixed(1) + ' ' + top.toFixed(1);

      var p = global.document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      p.setAttribute('stroke-width', U.lerp(2, 5.5, rand()).toFixed(1));
      svg.appendChild(p);
      paths.push(p);

      /* a couple of leaves per stalk */
      var leaves = 2 + Math.round(rand() * 2);
      for (var l = 0; l < leaves; l++) {
        var ly = U.lerp(top + 40, 520, rand());
        var side = l % 2 ? 1 : -1;
        var lx = x + bend * ((600 - ly) / (600 - top)) * 0.8;
        var ld = 'M' + lx.toFixed(1) + ' ' + ly.toFixed(1) +
          ' q' + (side * 34) + ' -20 ' + (side * 62) + ' -6';
        var lp = global.document.createElementNS(ns, 'path');
        lp.setAttribute('d', ld);
        lp.setAttribute('class', 'leaf');
        svg.appendChild(lp);
        paths.push(lp);
      }
    }

    /* prime every path for a draw-on reveal */
    paths.forEach(function (p) {
      var len = p.getTotalLength();
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = len;
      p._len = len;
    });

    return paths;
  }

  global.SCENE = {
    buildGrove: buildGrove,
    buildUnderstory: buildUnderstory,
    Spores: Spores,
    buildPrinter: buildPrinter,
    buildSpools: buildSpools,
    buildGrowth: buildGrowth,
    SLABS: SLABS
  };
})(window);
