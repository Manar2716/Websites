/* ═══════════════════════════════════════════════════════════════════
   phone.js — the device.

   There is exactly one phone in this deck and it is never unmounted.
   Slides do not contain it; they *request* it, by naming a pose. The
   loop below damps the rig toward whichever pose is current, which is
   why the device appears to travel continuously from the cold open to
   the final frame instead of being re-staged on every slide.

   The body is an extrusion: CSS cannot round an edge in 3D, so the
   silhouette is stacked SLICES times across the thickness. From any
   orbit angle the outline stays correct.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var U = global.KN.U;
  var SLICES = 19;
  var THICK  = 19;            /* px of device thickness, front to back */

  function el(cls, parent) {
    var d = document.createElement('div');
    if (cls) d.className = cls;
    if (parent) parent.appendChild(d);
    return d;
  }

  function build(host) {
    var phone = el('phone', host);

    /* ── extruded body ── */
    var slab = el('phone__slab', phone);
    var half = THICK / 2;
    for (var i = 0; i < SLICES; i++) {
      var s = el('phone__slice', slab);
      var z = -half + (THICK * i) / (SLICES - 1);
      /* The outermost slices pull in a hair so the edge reads as a
         chamfer rather than a cut tube. */
      var edge = Math.abs(z) / half;                 /* 0 centre → 1 rim */
      var inset = edge > .82 ? (edge - .82) * 9 : 0;
      s.style.transform = 'translateZ(' + U.round(z, 2) + 'px) scale(' + (1 - inset * .006) + ')';
      /* Slices nearer the rim are darker: it fakes the way a rounded
         metal edge falls away from the key light.
         This is an inset shadow and NOT filter: brightness(). A filter
         on a child of a preserve-3d parent flattens that child, which
         silently kills backface-visibility — and 19 flattened slices
         then paint over the back of the device when it turns round. */
      s.style.boxShadow = 'inset 0 0 0 999px rgba(0,0,0,' + U.round(edge * .34, 3) + ')';
    }

    /* ── front ── */
    var front = el('phone__face phone__face--front', phone);
    front.style.transform = 'translateZ(' + (half + .5) + 'px)';
    var screen = el('screen', front);
    var paper  = el('screen__paper', screen);
    var glare  = el('screen__glare', screen);
    el('island', front);

    /* ── back ── */
    var back = el('phone__face phone__face--back', phone);
    /* Note the sign: the back sits at NEGATIVE z and is turned to face
       outward from there. Putting it at +z (same plane as the front)
       makes the two faces coplanar, and which one you see becomes a
       coin toss. */
    back.style.transform = 'translateZ(' + (-(half + .5)) + 'px) rotateY(180deg)';
    el('phone__glassWin', back);

    var plateau = el('plateau', back);
    var lenses = {};
    ['wide', 'ultra', 'tele'].forEach(function (k) {
      var l = el('lens lens--' + k, plateau);
      var g = el('lens__glass', l);
      var iris = el('lens__iris', g);
      el('lens__ring', l);
      lenses[k] = { node: l, iris: iris };
    });
    el('flash', plateau);
    el('lidar', plateau);

    /* side hardware */
    ['act', 'vol1', 'vol2', 'pwr', 'cam'].forEach(function (k) {
      var b = el('btn btn--' + k, phone);
      b.style.transform = 'translateZ(0)';
    });

    return {
      phone: phone, screen: screen, paper: paper, glare: glare,
      plateau: plateau, lenses: lenses
    };
  }

  /* ── poses ──
     x/y are px offsets from centre, s is scale, ry/rx/rz are degrees,
     o is opacity. Anything omitted inherits the previous pose, so a
     slide that only wants to nudge the device does not have to restate
     its whole position. */
  function Rig(rigNode, shadowNode) {
    var cur  = { x: 0, y: 0, z: 0, s: 1, ry: 0, rx: 0, rz: 0, o: 0 };
    var want = { x: 0, y: 0, z: 0, s: 1, ry: 0, rx: 0, rz: 0, o: 0 };
    var lam  = { pos: 3.2, rot: 2.6, op: 3.4 };

    function set(pose, speed) {
      for (var k in pose) if (pose.hasOwnProperty(k)) want[k] = pose[k];
      if (speed) { lam.pos = speed; lam.rot = speed * .82; }
      else       { lam.pos = 3.2;   lam.rot = 2.6; }
    }

    /* Jump without damping — used when the deck is navigated backwards,
       where easing from a far-away pose would read as a mistake. */
    function snap(pose) {
      set(pose);
      for (var k in want) if (want.hasOwnProperty(k)) cur[k] = want[k];
      write();
    }

    function write() {
      var st = rigNode.style;
      st.setProperty('--px', U.round(cur.x, 2) + 'px');
      st.setProperty('--py', U.round(cur.y, 2) + 'px');
      st.setProperty('--pz', U.round(cur.z, 2) + 'px');
      st.setProperty('--ps', U.round(cur.s, 4));
      st.setProperty('--ry', U.round(cur.ry, 2) + 'deg');
      st.setProperty('--rx', U.round(cur.rx, 2) + 'deg');
      st.setProperty('--rz', U.round(cur.rz, 2) + 'deg');
      st.setProperty('--po', U.round(cur.o, 3));

      if (shadowNode) {
        var ss = shadowNode.style;
        ss.setProperty('--px', U.round(cur.x, 2) + 'px');
        ss.setProperty('--py', U.round(cur.y, 2) + 'px');
        ss.setProperty('--ps', U.round(cur.s * .9, 4));
        /* the contact shadow dies as the device turns edge-on or lifts */
        var face = Math.abs(Math.cos(cur.ry * Math.PI / 180));
        ss.setProperty('--shadowO', U.round(cur.o * face * .55, 3));
      }
    }

    global.KN.add(function (dt) {
      cur.x  = U.damp(cur.x,  want.x,  lam.pos, dt);
      cur.y  = U.damp(cur.y,  want.y,  lam.pos, dt);
      cur.z  = U.damp(cur.z,  want.z,  lam.pos, dt);
      cur.s  = U.damp(cur.s,  want.s,  lam.pos, dt);
      cur.ry = U.damp(cur.ry, want.ry, lam.rot, dt);
      cur.rx = U.damp(cur.rx, want.rx, lam.rot, dt);
      cur.rz = U.damp(cur.rz, want.rz, lam.rot, dt);
      cur.o  = U.damp(cur.o,  want.o,  lam.op,  dt);
      write();
    }, 'rig');

    return { set: set, snap: snap, current: cur };
  }

  global.KN.Phone = { build: build, Rig: Rig };
})(window);
