/* ═══════════════════════════════════════════════════════════
   camera.js — the camera is an operator, not a transform.

   Three things are stacked, in this order:

   1.  A **goal**, set fresh every frame by whatever is driving
       the scene — the scroll position on the table, the dish
       that is open, the piece you are dragging. The camera
       never jumps to its goal; it damps towards it with a
       different rate for the eye, the target and the lens, so
       the frame settles the way a real head settles: the body
       arrives first and the focus catches up.

   2.  A **move**, when something has to happen on a schedule
       rather than on a spring — diving into a dish, pulling
       back out to the table. A move takes the camera over for a
       fixed duration on a cinematic ease and hands it back.
       Springs are wrong for this: a spring's arrival time
       depends on how far it had to go, so opening the dish
       nearest the camera would feel like a different edit from
       opening the one at the far end of the table.

   3.  **Handheld**, always. A few millimetres of drift on two
       incommensurate frequencies, scaled by how far the lens is
       from its subject so it does not turn into a shake in a
       close-up. Without it a locked-off frame reads as a
       screenshot; with it the shot breathes. It is the first
       thing `prefers-reduced-motion` switches off.

   Focus is a real distance in metres and the aperture is how
   fast sharpness falls away from it, both handed to the
   composite. Racking focus from the near shrimp to the far one
   is therefore an actual rack, not a blur ramp.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SP = (global.SP = global.SP || {});
  var M = SP.M, m4 = M.m4, v3 = M.v3;

  SP.Camera = function () {
    var cam = {
      eye: [0, 1.4, 3.2],
      target: [0, .4, 0],
      up: [0, 1, 0],
      right: [1, 0, 0],
      fwd: [0, 0, -1],
      fov: 0.62,
      focus: 3.0,
      aperture: 2.4,
      roll: 0,

      view: m4.make(),
      proj: m4.make(),
      vp: m4.make(),
      invVP: m4.make(),

      aspect: 1.6,
      handheld: 1
    };

    /* the goal the springs chase */
    var g = {
      eye: cam.eye.slice(), target: cam.target.slice(),
      fov: cam.fov, focus: cam.focus, aperture: cam.aperture, roll: 0
    };

    /* the scripted move, when one is running */
    var mv = null;
    var t0 = { eye: [0, 0, 0], target: [0, 0, 0] };
    var tmp = [0, 0, 0];
    var clock = 0;

    /* ── setting the goal ─────────────────────────────────── */

    cam.goal = function (eye, target, opt) {
      opt = opt || {};
      g.eye[0] = eye[0]; g.eye[1] = eye[1]; g.eye[2] = eye[2];
      g.target[0] = target[0]; g.target[1] = target[1]; g.target[2] = target[2];
      if (opt.fov !== undefined) g.fov = opt.fov;
      if (opt.focus !== undefined) g.focus = opt.focus;
      else g.focus = v3.dist(eye, target);
      if (opt.aperture !== undefined) g.aperture = opt.aperture;
      if (opt.roll !== undefined) g.roll = opt.roll;
      return cam;
    };

    /* Snap, for the one case that has earned it: the first frame
       of the page, where there is nothing to move away from. */
    cam.snap = function () {
      v3.copy(cam.eye, g.eye); v3.copy(cam.target, g.target);
      cam.fov = g.fov; cam.focus = g.focus; cam.aperture = g.aperture;
      return cam;
    };

    /* ── a scripted move ──────────────────────────────────────
       `ease` defaults to a slow-in slow-out that spends most of
       its time at speed — the shape a camera operator's hand
       makes on a fluid head, not the shape of a CSS transition. */
    cam.move = function (eye, target, opt) {
      opt = opt || {};
      mv = {
        t: 0,
        dur: opt.dur || 1.1,
        ease: opt.ease || M.E.inOutQuint,
        eye: eye.slice(), target: target.slice(),
        fov: opt.fov === undefined ? cam.fov : opt.fov,
        focus: opt.focus,
        aperture: opt.aperture === undefined ? cam.aperture : opt.aperture,
        /* the arc: a move that travels in a straight line
           between two points reads as a slide. Real coverage
           swings. `lift` pushes the midpoint of the path up and
           out, so the camera comes round rather than through. */
        lift: opt.lift === undefined ? .18 : opt.lift,
        from: { eye: cam.eye.slice(), target: cam.target.slice(), fov: cam.fov, focus: cam.focus, aperture: cam.aperture },
        onDone: opt.onDone || null
      };
      v3.copy(g.eye, eye); v3.copy(g.target, target);
      g.fov = mv.fov; g.aperture = mv.aperture;
      g.focus = opt.focus === undefined ? v3.dist(eye, target) : opt.focus;
      return cam;
    };

    cam.moving = function () { return !!mv; };
    cam.cancelMove = function () { mv = null; };

    /* ── the frame ────────────────────────────────────────── */

    cam.update = function (dt, aspect, time) {
      clock = time;
      cam.aspect = aspect;
      var reduced = cam.handheld <= 0;

      if (mv) {
        mv.t += dt;
        var u = M.sat(mv.t / mv.dur);
        var e = mv.ease(u);
        v3.lerp(cam.eye, mv.from.eye, mv.eye, e);
        v3.lerp(cam.target, mv.from.target, mv.target, e);
        /* the arc, as a bulge on the path that peaks at the
           middle of the move and is gone by the end */
        var bulge = Math.sin(e * Math.PI) * mv.lift;
        if (bulge > 1e-4) {
          v3.sub(tmp, cam.eye, cam.target);
          var d = v3.len(tmp) || 1;
          cam.eye[1] += bulge * d * .16;
          cam.eye[0] += tmp[2] / d * bulge * d * .10;
          cam.eye[2] -= tmp[0] / d * bulge * d * .10;
        }
        cam.fov = M.lerp(mv.from.fov, mv.fov, e);
        cam.aperture = M.lerp(mv.from.aperture, mv.aperture, e);
        var tf = mv.focus === undefined ? v3.dist(cam.eye, cam.target) : mv.focus;
        /* focus lags the move by a fraction — a real operator
           pulls focus after the swing, not during it */
        cam.focus = M.damp(cam.focus, tf, 7, dt);
        if (u >= 1) { var done = mv.onDone; mv = null; if (done) done(); }
      } else {
        /* Different rates on purpose. The eye is heaviest, the
           target lighter (so the frame leads a moving subject),
           and the lens lightest of all. */
        v3.damp(cam.eye, cam.eye, g.eye, 4.4, dt);
        v3.damp(cam.target, cam.target, g.target, 6.2, dt);
        cam.fov = M.damp(cam.fov, g.fov, 5.0, dt);
        cam.focus = M.damp(cam.focus, g.focus, 5.6, dt);
        cam.aperture = M.damp(cam.aperture, g.aperture, 3.6, dt);
      }
      cam.roll = M.damp(cam.roll, g.roll, 3.2, dt);

      /* handheld, scaled by subject distance so a close-up does
         not turn into a shake */
      var ex = cam.eye[0], ey = cam.eye[1], ez = cam.eye[2];
      var tx = cam.target[0], ty = cam.target[1], tz = cam.target[2];
      if (!reduced) {
        var d2 = v3.dist(cam.eye, cam.target);
        var amp = Math.min(.014, .0042 * d2) * cam.handheld;
        ex += Math.sin(time * .61) * amp + Math.sin(time * 1.43) * amp * .45;
        ey += Math.sin(time * .47 + 1.7) * amp * .8 + Math.sin(time * 1.19 + .4) * amp * .35;
        ez += Math.sin(time * .53 + 3.1) * amp * .7;
        tx += Math.sin(time * .39 + 2.2) * amp * .5;
        ty += Math.sin(time * .58 + .9) * amp * .4;
      }

      var up = [Math.sin(cam.roll), Math.cos(cam.roll), 0];
      m4.lookAt(cam.view, [ex, ey, ez], [tx, ty, tz], up);
      m4.perspective(cam.proj, cam.fov, aspect, .04, 60);
      m4.mul(cam.vp, cam.proj, cam.view);
      m4.invert(cam.invVP, cam.vp);

      /* basis, for billboards and for orbit maths upstream */
      cam.right[0] = cam.view[0]; cam.right[1] = cam.view[4]; cam.right[2] = cam.view[8];
      cam.up[0] = cam.view[1]; cam.up[1] = cam.view[5]; cam.up[2] = cam.view[9];
      cam.fwd[0] = -cam.view[2]; cam.fwd[1] = -cam.view[6]; cam.fwd[2] = -cam.view[10];
      /* the shaders want the *real* eye, handheld included */
      cam.eyeR = cam.eyeR || [0, 0, 0];
      cam.eyeR[0] = ex; cam.eyeR[1] = ey; cam.eyeR[2] = ez;
      return cam;
    };

    /* ── rays ─────────────────────────────────────────────── */

    var a = [0, 0, 0], b = [0, 0, 0], ray = [0, 0, 0];
    cam.rayFromNdc = function (x, y) {
      v3.transformM4(a, [x, y, -1], cam.invVP);
      v3.transformM4(b, [x, y, 1], cam.invVP);
      v3.sub(ray, b, a);
      return v3.norm(ray, ray);
    };

    /* Project a world point to normalised device coordinates.
       The DOM labels that sit over the scene are positioned from
       this, which is what keeps a caption attached to the dish
       it is naming while the camera moves. */
    var pr = [0, 0, 0];
    cam.project = function (p, out) {
      var x = p[0], y = p[1], z = p[2], m = cam.vp;
      var w = m[3] * x + m[7] * y + m[11] * z + m[15];
      out[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
      out[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
      out[2] = w;              /* > 0 means in front of the lens */
      return out;
    };

    /* An orbit position around a point: azimuth, elevation,
       radius. Every "the camera goes round it" in this project
       comes through here. */
    cam.orbit = function (centre, az, el, r, out) {
      var ce = Math.cos(el);
      out[0] = centre[0] + Math.sin(az) * ce * r;
      out[1] = centre[1] + Math.sin(el) * r;
      out[2] = centre[2] + Math.cos(az) * ce * r;
      return out;
    };

    return cam;
  };

})(window);
