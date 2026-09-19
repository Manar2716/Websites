/* ═══════════════════════════════════════════════════════════════════
   product.js — the product shots.

   Nothing here is drawn. The device on screen is photography, cut from
   the two source images by tools/build-assets.py, and this module does
   three things with it:

     · holds all four views in one stack, centred on each other
     · crossfades between them, which is what reads as the camera
       moving around the product
     · damps the whole stack toward a requested pose

   One device, one finish, for the whole deck: the front, side, back and
   camera close-up are all the burgundy unit, so the run of show is a
   continuous look at a single object rather than a slideshow of
   different ones.

   MAX HEIGHTS ARE NOT DECORATION. The sources are small — the back and
   side are 204px tall natively — so each view carries the largest size
   it can be drawn at before it visibly softens. Scenes ask for a height
   and get min(asked, cap). Anything that wants to fill more frame than
   the photography can honestly cover is built from type instead.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var U = global.KN.U;

  /* view → [file, natural aspect (w/h), max sensible on-screen height]
     Caps are set from each source's real pixel size. The camera macro is
     749 px wide natively, so unlike the old cut it can carry a genuine
     full-frame reveal instead of being nursed along at a quarter size. */
  var VIEWS = {
    front:    ['front.png',    229 / 498, 700],
    back:     ['back.png',     180 / 472, 640],
    camera:   ['camera.png',   749 / 494, 560],
    finishes: ['finishes.png', 845 / 460, 470]
  };

  function build(host) {
    var shots = {};
    Object.keys(VIEWS).forEach(function (k) {
      var spec = VIEWS[k];
      var wrap = document.createElement('div');
      wrap.className = 'shot shot--' + k;
      var img = document.createElement('img');
      img.src = 'assets/img/' + spec[0];
      img.alt = '';
      img.decoding = 'async';
      /* the first view is needed for the opening reveal, so it is not
         allowed to arrive late */
      img.loading = k === 'front' ? 'eager' : 'lazy';
      img.alt = '';
      wrap.appendChild(img);

      /* Call-out rings for the camera close-up, positioned as a
         percentage of the photograph itself so they stay registered to
         the lenses at every size. Centres were measured off the image;
         which physical lens is which follows Apple's conventional Pro
         layout, and the sources panel says so. */
      var rings = null;
      if (k === 'camera') {
        rings = {};
        [['main', 19, 40], ['ultra', 22, 70], ['tele', 45, 53]].forEach(function (r) {
          var d = document.createElement('div');
          d.className = 'ring ring--' + r[0];
          d.style.left = r[1] + '%';
          d.style.top = r[2] + '%';
          wrap.appendChild(d);
          rings[r[0]] = d;
        });
      }

      host.appendChild(wrap);
      shots[k] = { node: wrap, img: img, aspect: spec[1], cap: spec[2], rings: rings };
    });
    return shots;
  }

  /* Show one view, hide the rest. The dissolve is slow by design: these
     are four separate photographs at different angles, not frames of one
     turntable, so a fast cut reads as a mistake where a long dissolve
     reads as a camera move. */
  function Views(shots) {
    var current = null;

    function show(k, height) {
      current = k;
      Object.keys(shots).forEach(function (j) {
        var s = shots[j];
        var on = j === k;
        s.node.classList.toggle('is-on', on);
        if (on && height) {
          var h = Math.min(height, s.cap);
          s.img.style.height = Math.round(h) + 'px';
          s.img.style.width = Math.round(h * s.aspect) + 'px';
        }
      });
    }

    function hide() {
      current = null;
      Object.keys(shots).forEach(function (j) { shots[j].node.classList.remove('is-on'); });
    }

    /* light one lens, dim the photograph behind it */
    function call(which) {
      var p = shots.camera;
      if (!p || !p.rings) return;
      p.node.classList.toggle('is-isolating', !!which);
      Object.keys(p.rings).forEach(function (k) {
        p.rings[k].classList.toggle('is-on', k === which);
      });
    }

    return { show: show, hide: hide, call: call, get: function () { return current; } };
  }

  /* ── pose rig ──
     Identical contract to the rest of the deck: scenes name a pose, the
     loop damps toward it. Kept separate from opacity, which lives on the
     stack's parent, so a fade never interferes with a transform. */
  function Rig(node, shadow) {
    var cur  = { x: 0, y: 0, s: 1, o: 0, rz: 0 };
    var want = { x: 0, y: 0, s: 1, o: 0, rz: 0 };
    var lam = 3.0;

    function set(pose, speed) {
      for (var k in pose) if (pose.hasOwnProperty(k)) want[k] = pose[k];
      lam = speed || 3.0;
    }

    function snap(pose) {
      if (pose) set(pose);
      for (var k in want) if (want.hasOwnProperty(k)) cur[k] = want[k];
      write();
    }

    function write() {
      var st = node.style;
      st.setProperty('--px', U.round(cur.x, 2) + 'px');
      st.setProperty('--py', U.round(cur.y, 2) + 'px');
      st.setProperty('--ps', U.round(cur.s, 4));
      st.setProperty('--pr', U.round(cur.rz, 3) + 'deg');
      st.setProperty('--po', U.round(cur.o, 3));
      if (shadow) {
        var ss = shadow.style;
        ss.setProperty('--px', U.round(cur.x, 2) + 'px');
        ss.setProperty('--py', U.round(cur.y, 2) + 'px');
        ss.setProperty('--ps', U.round(cur.s, 4));
        ss.setProperty('--so', U.round(cur.o * .5, 3));
      }
    }

    global.KN.add(function (dt) {
      cur.x  = U.damp(cur.x,  want.x,  lam, dt);
      cur.y  = U.damp(cur.y,  want.y,  lam, dt);
      cur.s  = U.damp(cur.s,  want.s,  lam, dt);
      cur.rz = U.damp(cur.rz, want.rz, lam, dt);
      cur.o  = U.damp(cur.o,  want.o,  lam * 1.15, dt);
      write();
    }, 'product-rig');

    return { set: set, snap: snap, current: cur };
  }

  global.KN.Product = { build: build, Views: Views, Rig: Rig, VIEWS: VIEWS };
})(window);
