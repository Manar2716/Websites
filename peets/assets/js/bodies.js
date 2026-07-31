/* ═══════════════════════════════════════════════════════════
   bodies.js — one physics system for everything that moves in
   crowds: beans, droplets, machine parts, dust, cocoa, grounds.

   The design decision that makes the film work is that there is
   no "explode mode" and no "assemble mode". Every body is always
   a spring chasing a target with its own mass and drag. What
   changes between acts is only *where the target is* — an orbit
   around the camera, a point on the surface of a cup, a pixel
   inside a letterform. Because it is one continuous simulation,
   beans can be mid-orbit when the cup target arrives and they
   arc into place carrying the momentum they already had, which
   is the difference between assembling and cross-fading.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var PEET = (global.PEET = global.PEET || {});
  var M = PEET.M;
  var TAU = Math.PI * 2;

  function Bodies(max, opt) {
    opt = opt || {};
    this.max = max;
    this.count = max;
    this.sprite = !!opt.sprite;

    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.tgt = new Float32Array(max * 3);   /* the assembled destination */
    this.axis = new Float32Array(max * 3);  /* spin axis */
    this.ang = new Float32Array(max);
    this.angTgt = new Float32Array(max);    /* the pose a part settles into */
    this.angVel = new Float32Array(max);
    this.scale = new Float32Array(max);
    this.scale3 = new Float32Array(max * 3);
    this.tint = new Float32Array(max * 4);
    /* per-body constants: 0 orbit radius · 1 orbit phase ·
       2 orbit speed · 3 height · 4 bob phase · 5 mass ·
       6 appear threshold · 7 turbulence phase */
    this.seed = new Float32Array(max * 8);

    this.buf = new Float32Array(max * 16);
    this._tmp = [0, 0, 0];
  }

  /* ── initial distribution ────────────────────────────────────
     A cylindrical shell around the camera axis: this is the swarm
     the camera flies through, and also the reservoir every other
     act pulls bodies out of. */

  Bodies.prototype.shell = function (cfg) {
    var rnd = M.rng(cfg.seed || 11);
    var i, n = this.max;
    for (i = 0; i < n; i++) {
      var r = cfg.radius[0] + Math.pow(rnd(), cfg.radiusBias || 0.65) * (cfg.radius[1] - cfg.radius[0]);
      var a = rnd() * TAU;
      var y = cfg.height[0] + rnd() * (cfg.height[1] - cfg.height[0]);

      this.seed[i * 8]     = r;
      this.seed[i * 8 + 1] = a;
      this.seed[i * 8 + 2] = (cfg.speed[0] + rnd() * (cfg.speed[1] - cfg.speed[0])) * (rnd() < (cfg.reverse || 0) ? -1 : 1);
      this.seed[i * 8 + 3] = y;
      this.seed[i * 8 + 4] = rnd() * TAU;
      /* heavier bodies lag further behind their target — the whole
         swarm then moves like a flock rather than a rigid lattice */
      this.seed[i * 8 + 5] = 0.55 + rnd() * 0.9;
      this.seed[i * 8 + 6] = rnd();
      this.seed[i * 8 + 7] = rnd() * 100;

      this.pos[i * 3]     = cfg.center[0] + Math.cos(a) * r;
      this.pos[i * 3 + 1] = cfg.center[1] + y;
      this.pos[i * 3 + 2] = cfg.center[2] + Math.sin(a) * r;
      this.tgt[i * 3]     = this.pos[i * 3];
      this.tgt[i * 3 + 1] = this.pos[i * 3 + 1];
      this.tgt[i * 3 + 2] = this.pos[i * 3 + 2];

      var ax = rnd() * 2 - 1, ay = rnd() * 2 - 1, az = rnd() * 2 - 1;
      var al = Math.hypot(ax, ay, az) || 1;
      this.axis[i * 3] = ax / al; this.axis[i * 3 + 1] = ay / al; this.axis[i * 3 + 2] = az / al;
      this.ang[i] = rnd() * TAU;
      this.angVel[i] = (cfg.spin[0] + rnd() * (cfg.spin[1] - cfg.spin[0])) * (rnd() < .5 ? -1 : 1);

      var s = cfg.scale[0] + Math.pow(rnd(), 1.4) * (cfg.scale[1] - cfg.scale[0]);
      this.scale[i] = s;
      /* beans are never twins: a few percent on each axis is
         enough that a close-up crowd does not read as a stamp */
      this.scale3[i * 3]     = 1 + (rnd() - .5) * (cfg.jitter || 0.16);
      this.scale3[i * 3 + 1] = 1 + (rnd() - .5) * (cfg.jitter || 0.16);
      this.scale3[i * 3 + 2] = 1 + (rnd() - .5) * (cfg.jitter || 0.16);

      this.tint[i * 4]     = rnd();          /* roast */
      this.tint[i * 4 + 1] = rnd();          /* roughness jitter */
      this.tint[i * 4 + 2] = 0;              /* alpha, driven per frame */
      this.tint[i * 4 + 3] = rnd();          /* free seed */
    }
    return this;
  };

  /* Give every body a fixed pose — used for the machine, where
     each part has one true place to be rather than an orbit. */
  Bodies.prototype.place = function (i, p, q, s3, scale) {
    this.tgt[i * 3] = p[0]; this.tgt[i * 3 + 1] = p[1]; this.tgt[i * 3 + 2] = p[2];
    if (q) {
      this.axis[i * 3] = q[0]; this.axis[i * 3 + 1] = q[1]; this.axis[i * 3 + 2] = q[2];
      this.angTgt[i] = q[3];
    }
    if (s3) { this.scale3[i * 3] = s3[0]; this.scale3[i * 3 + 1] = s3[1]; this.scale3[i * 3 + 2] = s3[2]; }
    if (scale !== undefined) this.scale[i] = scale;
    return this;
  };

  /* Assign targets from a sampled point cloud, pushed out along
     the surface normal so bodies rest *on* the surface instead of
     half-buried in it. */
  Bodies.prototype.cloud = function (cloud, offset, transform, limit) {
    var n = Math.min(limit || this.max, this.max);
    var cn = cloud.count;
    for (var i = 0; i < n; i++) {
      var j = i % cn;
      var x = cloud.pos[j * 3] + cloud.nrm[j * 3] * offset;
      var y = cloud.pos[j * 3 + 1] + cloud.nrm[j * 3 + 1] * offset;
      var z = cloud.pos[j * 3 + 2] + cloud.nrm[j * 3 + 2] * offset;
      if (transform) {
        this._tmp[0] = x; this._tmp[1] = y; this._tmp[2] = z;
        M.v3.transformM4(this._tmp, this._tmp, transform);
        x = this._tmp[0]; y = this._tmp[1]; z = this._tmp[2];
      }
      this.tgt[i * 3] = x; this.tgt[i * 3 + 1] = y; this.tgt[i * 3 + 2] = z;
    }
    return this;
  };

  /* Targets straight from a flat xyz array (letterform clouds). */
  Bodies.prototype.cloudFlat = function (pos, count, mat) {
    var n = this.max;
    for (var i = 0; i < n; i++) {
      var j = i % count;
      this._tmp[0] = pos[j * 3]; this._tmp[1] = pos[j * 3 + 1]; this._tmp[2] = pos[j * 3 + 2];
      if (mat) M.v3.transformM4(this._tmp, this._tmp, mat);
      this.tgt[i * 3] = this._tmp[0];
      this.tgt[i * 3 + 1] = this._tmp[1];
      this.tgt[i * 3 + 2] = this._tmp[2];
    }
    return this;
  };

  /* Kick every body outward from a point — the explosion. Applied
     as a velocity impulse, not a position jump, so the spring that
     is still pulling them home has something to fight. */
  Bodies.prototype.impulse = function (center, strength, jitter, seedN) {
    var rnd = M.rng(seedN || 5);
    for (var i = 0; i < this.count; i++) {
      var dx = this.pos[i * 3] - center[0];
      var dy = this.pos[i * 3 + 1] - center[1];
      var dz = this.pos[i * 3 + 2] - center[2];
      var l = Math.hypot(dx, dy, dz) || 1;
      var s = strength * (0.55 + rnd() * 0.9) / this.seed[i * 8 + 5];
      this.vel[i * 3]     += (dx / l) * s + (rnd() - .5) * jitter;
      this.vel[i * 3 + 1] += (dy / l) * s + (rnd() - .5) * jitter + strength * 0.22;
      this.vel[i * 3 + 2] += (dz / l) * s + (rnd() - .5) * jitter;
      this.angVel[i] += (rnd() - .5) * strength * 2.2;
    }
    return this;
  };

  /* ── the step ────────────────────────────────────────────────
     p.orbitCenter  where the analytic orbit is centred
     p.assemble     0 = orbit, 1 = the cloud target
     p.spring/damp  how hard, how settled
     p.swirl        tangential push around Y, on top of the spring
     p.turb         wander amplitude
     p.gravity      negative Y accel (frozen splash sets this to 0)
     p.drag         velocity bleed; high drag = underwater slow-mo
     p.alpha        global opacity, staggered per body by seed 6
     p.reveal       0..1 wipe across the appear thresholds
  */

  Bodies.prototype.update = function (dt, p) {
    var n = this.count;
    var t = p.time;
    var oc = p.orbitCenter || [0, 0, 0];
    var assemble = p.assemble || 0;
    var spring = p.spring !== undefined ? p.spring : 26;
    var damp = p.damp !== undefined ? p.damp : 7;
    var swirl = p.swirl || 0;
    var radial = p.radial || 0;
    var turb = p.turb || 0;
    var turbF = p.turbFreq || 1.2;
    var grav = p.gravity || 0;
    var drag = p.drag !== undefined ? p.drag : 0.6;
    var bob = p.bob || 0;
    var orbitSpeed = p.orbitSpeed !== undefined ? p.orbitSpeed : 1;
    var radiusMul = p.radiusMul !== undefined ? p.radiusMul : 1;
    var spinMul = p.spinMul !== undefined ? p.spinMul : 1;
    var alpha = p.alpha !== undefined ? p.alpha : 1;
    var reveal = p.reveal !== undefined ? p.reveal : 1;
    var revealSoft = p.revealSoft || 0.35;
    var freeze = p.freeze || 0;
    /* stagger: bodies arrive over a window rather than together —
       a hundred parts landing on the same frame reads as a cut */
    var stag = p.assembleStagger || 0;
    var settle = !!p.settleAngle;
    /* Bodies compact as they arrive. A crowd loose enough to read
       as a swarm is too coarse to read as the thing it assembles
       into — the same two thousand beans have to be big in the air
       and small on the surface of a cup. */
    this.scaleMul = p.scaleMul !== undefined ? p.scaleMul : 1;

    var dragK = Math.exp(-drag * dt);

    for (var i = 0; i < n; i++) {
      var i3 = i * 3, i8 = i * 8;
      var asm = stag > 0
        ? M.sat((assemble - this.seed[i8 + 6] * stag) / (1 - stag))
        : assemble;

      /* — the analytic orbit target — */
      var r = this.seed[i8] * radiusMul;
      var a = this.seed[i8 + 1] + t * this.seed[i8 + 2] * orbitSpeed;
      var ox = oc[0] + Math.cos(a) * r;
      var oy = oc[1] + this.seed[i8 + 3] + Math.sin(t * 0.7 + this.seed[i8 + 4]) * bob;
      var oz = oc[2] + Math.sin(a) * r;

      /* — blended with the assembled target — */
      var tx = ox + (this.tgt[i3] - ox) * asm;
      var ty = oy + (this.tgt[i3 + 1] - oy) * asm;
      var tz = oz + (this.tgt[i3 + 2] - oz) * asm;

      var mass = this.seed[i8 + 5];
      var k = spring / mass;
      var d = damp;

      var px = this.pos[i3], py = this.pos[i3 + 1], pz = this.pos[i3 + 2];
      var vx = this.vel[i3], vy = this.vel[i3 + 1], vz = this.vel[i3 + 2];

      var ax = (tx - px) * k - vx * d;
      var ay = (ty - py) * k - vy * d + grav;
      var az = (tz - pz) * k - vz * d;

      /* tangential push: bodies do not fall straight into their
         target, they wind into it */
      if (swirl !== 0 || radial !== 0) {
        var rx = px - oc[0], rz = pz - oc[2];
        var rl = Math.hypot(rx, rz) || 1;
        ax += (-rz / rl) * swirl + (rx / rl) * radial;
        az += (rx / rl) * swirl + (rz / rl) * radial;
      }

      /* wander — three cheap sines rather than curl noise, because
         this runs a few thousand times a frame and at these speeds
         the extra octaves cost more than they read */
      if (turb !== 0) {
        var ph = this.seed[i8 + 7];
        ax += Math.sin(t * turbF + ph) * turb;
        ay += Math.sin(t * turbF * 1.31 + ph * 1.7) * turb * 0.8;
        az += Math.cos(t * turbF * 0.87 + ph * 2.3) * turb;
      }

      if (freeze > 0) { ax *= 1 - freeze; ay *= 1 - freeze; az *= 1 - freeze; }

      vx += ax * dt; vy += ay * dt; vz += az * dt;
      vx *= dragK; vy *= dragK; vz *= dragK;
      if (freeze > 0) { var fk = 1 - freeze; vx *= fk; vy *= fk; vz *= fk; }

      this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
      this.pos[i3] = px + vx * dt;
      this.pos[i3 + 1] = py + vy * dt;
      this.pos[i3 + 2] = pz + vz * dt;

      if (settle) {
        /* free tumble on the way in, then the pose the part is
           meant to hold — the spin does not stop, it *lands* */
        this.ang[i] += this.angVel[i] * spinMul * dt * (1 - asm);
        if (asm > 0.001) {
          var lam = 1 - Math.exp(-asm * asm * 14 * dt);
          this.ang[i] += (this.angTgt[i] - this.ang[i]) * lam;
        }
      } else {
        this.ang[i] += this.angVel[i] * spinMul * dt * (1 - freeze);
      }

      /* staggered appearance — a wave across the crowd rather than
         every body switching on in the same frame */
      var th = this.seed[i8 + 6];
      var vis = M.sat((reveal - th * (1 - revealSoft)) / revealSoft);
      this.tint[i * 4 + 2] = vis * alpha;
    }
    return this;
  };

  /* ── pack for the GPU ────────────────────────────────────────
     16 floats: position+scale, quaternion, tint, non-uniform scale.
     Bodies that are fully transparent are skipped rather than
     uploaded — in the acts where only a few hundred of several
     thousand beans are visible, that is most of the buffer. */

  Bodies.prototype.pack = function () {
    var b = this.buf, w = 0, n = this.count;
    var sm = this.scaleMul === undefined ? 1 : this.scaleMul;
    for (var i = 0; i < n; i++) {
      var alpha = this.tint[i * 4 + 2];
      if (alpha <= 0.004) continue;

      b[w] = this.pos[i * 3];
      b[w + 1] = this.pos[i * 3 + 1];
      b[w + 2] = this.pos[i * 3 + 2];
      b[w + 3] = this.scale[i] * sm;

      if (this.sprite) {
        /* sprites need only a spin angle; the shader reads iQuat.x */
        b[w + 4] = this.ang[i]; b[w + 5] = 0; b[w + 6] = 0; b[w + 7] = 1;
      } else {
        var h = this.ang[i] * 0.5;
        var s = Math.sin(h);
        b[w + 4] = this.axis[i * 3] * s;
        b[w + 5] = this.axis[i * 3 + 1] * s;
        b[w + 6] = this.axis[i * 3 + 2] * s;
        b[w + 7] = Math.cos(h);
      }

      b[w + 8] = this.tint[i * 4];
      b[w + 9] = this.tint[i * 4 + 1];
      b[w + 10] = alpha;
      b[w + 11] = this.tint[i * 4 + 3];

      b[w + 12] = this.scale3[i * 3];
      b[w + 13] = this.scale3[i * 3 + 1];
      b[w + 14] = this.scale3[i * 3 + 2];
      b[w + 15] = 1;

      w += 16;
    }
    this.packed = w / 16;
    return w;
  };

  PEET.Bodies = Bodies;

})(window);
