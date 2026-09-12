/* ═══════════════════════════════════════════════════════════════════
   globe.js — the route network, drawn the way a dispatcher would.

   No map tiles, no coastlines, no image assets. An orthographic
   wireframe sphere with a graticule, city nodes and true great-circle
   arcs between them — which is what a flight-planning display actually
   looks like, and what actually governs where an aeroplane can go.

   Everything here is real geometry rather than decoration:

   · arcs are slerped between unit vectors, so they bow the way a real
     track does — the London–Tokyo line goes over the pole because that
     genuinely is the short way round
   · distances are haversine on R = 6371 km, computed at runtime
   · a route is drawn as reachable or not by comparing that distance
     against the published range of whichever aircraft is selected in
     the fleet section above. Selecting an A220 really does grey out
     the transpacific routes.
   ═══════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var AX = global.AX, U = AX.U;
  var R_EARTH = 6371;
  var D2R = Math.PI / 180;

  var CITIES = {
    TLS: { name: 'Toulouse',     lat: 43.63,  lon: 1.37 },
    LHR: { name: 'London',       lat: 51.47,  lon: -0.45 },
    KEF: { name: 'Reykjavík',    lat: 63.99,  lon: -22.62 },
    JFK: { name: 'New York',     lat: 40.64,  lon: -73.78 },
    LAX: { name: 'Los Angeles',  lat: 33.94,  lon: -118.41 },
    GRU: { name: 'São Paulo',    lat: -23.43, lon: -46.47 },
    SCL: { name: 'Santiago',     lat: -33.39, lon: -70.79 },
    DXB: { name: 'Dubai',        lat: 25.25,  lon: 55.36 },
    BOM: { name: 'Mumbai',       lat: 19.09,  lon: 72.87 },
    SIN: { name: 'Singapore',    lat: 1.36,   lon: 103.99 },
    HND: { name: 'Tokyo',        lat: 35.55,  lon: 139.78 },
    SYD: { name: 'Sydney',       lat: -33.94, lon: 151.18 },
    AKL: { name: 'Auckland',     lat: -37.01, lon: 174.79 },
    JNB: { name: 'Johannesburg', lat: -26.13, lon: 28.24 }
  };

  var ROUTES = [
    { a: 'LHR', b: 'TLS', label: 'Regional hop' },
    { a: 'LHR', b: 'KEF', label: 'North Atlantic rim' },
    { a: 'LAX', b: 'JFK', label: 'Transcontinental' },
    { a: 'TLS', b: 'DXB', label: 'Europe–Gulf' },
    { a: 'JFK', b: 'LHR', label: 'The busy one' },
    { a: 'DXB', b: 'SIN', label: 'Gulf–Southeast Asia' },
    { a: 'SIN', b: 'SYD', label: 'Kangaroo sector' },
    { a: 'JFK', b: 'GRU', label: 'North–South Atlantic' },
    { a: 'SIN', b: 'JNB', label: 'Indian Ocean crossing' },
    { a: 'LHR', b: 'SIN', label: 'Europe–Singapore' },
    { a: 'JFK', b: 'HND', label: 'Polar Pacific' },
    { a: 'SYD', b: 'SCL', label: 'Ultra-long Pacific' }
  ];

  /* ───────────────── spherical maths ───────────────── */

  function toVec(lat, lon) {
    var a = lat * D2R, o = lon * D2R;
    var ca = Math.cos(a);
    return [ca * Math.cos(o), Math.sin(a), ca * Math.sin(o)];
  }

  function haversine(A, B) {
    var dLat = (B.lat - A.lat) * D2R;
    var dLon = (B.lon - A.lon) * D2R;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(A.lat * D2R) * Math.cos(B.lat * D2R) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  /* spherical linear interpolation — the actual definition of a great
     circle track between two points */
  function slerp(a, b, t) {
    var dot = U.clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1);
    var om = Math.acos(dot);
    if (om < 1e-6) return a.slice();
    var s = Math.sin(om);
    var k0 = Math.sin((1 - t) * om) / s;
    var k1 = Math.sin(t * om) / s;
    return [a[0] * k0 + b[0] * k1, a[1] * k0 + b[1] * k1, a[2] * k0 + b[2] * k1];
  }

  function init(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    var W = 0, H = 0, CX = 0, CY = 0, R = 0;

    var view = {
      yaw: -0.35, pitch: 0.42,
      tYaw: -0.35, tPitch: 0.42,
      spin: 0.055,          /* rad/sec of idle rotation */
      idle: 0,
      drag: false, lastX: 0, lastY: 0, vYaw: 0
    };

    var state = {
      aircraft: null,       /* {hue, range_km, mach, name} */
      selected: -1,
      hover: -1,
      visible: true,
      phase: 0
    };

    /* precompute endpoints + true distances once */
    var routes = ROUTES.map(function (r, i) {
      var A = CITIES[r.a], B = CITIES[r.b];
      return {
        i: i, code: r.a + '–' + r.b, label: r.label,
        a: A, b: B, av: toVec(A.lat, A.lon), bv: toVec(B.lat, B.lon),
        km: Math.round(haversine(A, B)),
        anim: 0, glow: 0, reach: 1
      };
    });
    routes.sort(function (x, y) { return x.km - y.km; });
    routes.forEach(function (r, i) { r.i = i; });

    function fit() {
      var m = AX.fitCanvas(canvas, ctx);
      W = m.w; H = m.h;
      CX = W / 2; CY = H / 2;
      R = Math.min(W, H) * 0.40;
    }
    fit();
    AX.onResize(fit);

    /* rotate a unit vector into view space */
    var cy_ = 1, sy_ = 0, cp_ = 1, sp_ = 0;
    function refreshTrig() {
      cy_ = Math.cos(view.yaw); sy_ = Math.sin(view.yaw);
      cp_ = Math.cos(view.pitch); sp_ = Math.sin(view.pitch);
    }

    function project(v, alt) {
      var k = 1 + (alt || 0);
      var x = v[0] * k, y = v[1] * k, z = v[2] * k;
      var x1 = x * cy_ + z * sy_;
      var z1 = -x * sy_ + z * cy_;
      var y2 = y * cp_ - z1 * sp_;
      var z2 = y * sp_ + z1 * cp_;
      return { x: CX + R * x1, y: CY - R * y2, z: z2, front: z2 > 0 };
    }

    /* ───────────────── drawing ───────────────── */

    function drawSphere() {
      /* limb glow — the atmosphere seen edge-on */
      var g = ctx.createRadialGradient(CX, CY, R * 0.80, CX, CY, R * 1.16);
      g.addColorStop(0, 'rgba(72,132,190,0.00)');
      g.addColorStop(0.72, 'rgba(86,158,222,0.16)');
      g.addColorStop(1, 'rgba(86,158,222,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(CX, CY, R * 1.16, 0, Math.PI * 2); ctx.fill();

      /* the globe body: a dark disc lit from the upper left, so the
         graticule on the far side reads as "behind" rather than "above" */
      var s = ctx.createRadialGradient(CX - R * 0.35, CY - R * 0.42, R * 0.05, CX, CY, R);
      s.addColorStop(0, 'rgba(28,52,88,0.92)');
      s.addColorStop(0.62, 'rgba(14,28,52,0.94)');
      s.addColorStop(1, 'rgba(7,14,30,0.98)');
      ctx.fillStyle = s;
      ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = 'rgba(124,178,236,0.26)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.stroke();
    }

    function drawGraticule() {
      var lat, lon, i, p, started;
      ctx.lineWidth = 1;

      /* parallels */
      for (lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath(); started = false;
        for (i = 0; i <= 96; i++) {
          p = project(toVec(lat, -180 + i * 3.75));
          if (!p.front) { started = false; continue; }
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = lat === 0 ? 'rgba(140,192,246,0.26)' : 'rgba(120,166,220,0.115)';
        ctx.stroke();
      }
      /* meridians */
      for (lon = -180; lon < 180; lon += 30) {
        ctx.beginPath(); started = false;
        for (i = 0; i <= 72; i++) {
          p = project(toVec(-90 + i * 2.5, lon));
          if (!p.front) { started = false; continue; }
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = 'rgba(120,166,220,0.115)';
        ctx.stroke();
      }
    }

    function arcPoints(r, segs) {
      var pts = [], i, t, v, alt;
      for (i = 0; i <= segs; i++) {
        t = i / segs;
        v = slerp(r.av, r.bv, t);
        /* lift the track off the surface so it clears the limb —
           height scales with how long the route is */
        alt = Math.sin(Math.PI * t) * (0.020 + r.km / 20000 * 0.075);
        pts.push(project(v, alt));
      }
      return pts;
    }

    function strokePolyline(pts, color, width, dash) {
      ctx.save();
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (dash) ctx.setLineDash(dash); else ctx.setLineDash([]);
      var started = false;
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        if (!p.front) { started = false; continue; }
        if (!started) { ctx.moveTo(p.x, p.y); started = true; }
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    function hexA(hex, a) {
      var h = hex.replace('#', '');
      var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
      return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }

    function drawRoutes(dt) {
      var hue = (state.aircraft && state.aircraft.hue) || '#7FC9F5';
      for (var i = 0; i < routes.length; i++) {
        var r = routes[i];
        var active = (state.selected === i) || (state.hover === i);
        r.glow = U.damp(r.glow, active ? 1 : 0, 8, dt);
        var inRange = r.reach > 0.5;

        var pts = arcPoints(r, 64);
        var base = inRange
          ? hexA(hue, 0.44 + r.glow * 0.50)
          : 'rgba(146,170,206,0.26)';

        strokePolyline(pts, base, 1.4 + r.glow * 1.6, inRange ? null : [3, 5]);

        /* a moving marker, but only on routes the aircraft can fly */
        if (inRange && r.glow > 0.02) {
          r.anim += dt * (900 / r.km) * 0.9;   /* faster on short sectors */
          if (r.anim > 1) r.anim -= 1;
          var t = r.anim;
          var v = slerp(r.av, r.bv, t);
          var alt = Math.sin(Math.PI * t) * (0.020 + r.km / 20000 * 0.075);
          var p = project(v, alt);
          if (p.front) {
            var v2 = slerp(r.av, r.bv, Math.min(1, t + 0.01));
            var p2 = project(v2, alt);
            var ang = Math.atan2(p2.y - p.y, p2.x - p.x);
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(ang);
            ctx.fillStyle = hexA(hue, 0.55 + r.glow * 0.45);
            ctx.beginPath();
            ctx.moveTo(6, 0); ctx.lineTo(-4, 3.4); ctx.lineTo(-2, 0); ctx.lineTo(-4, -3.4);
            ctx.closePath(); ctx.fill();
            ctx.restore();
          }
        }
      }
    }

    function drawCities() {
      var seen = {};
      for (var i = 0; i < routes.length; i++) {
        var r = routes[i];
        var active = (state.selected === i) || (state.hover === i);
        [[r.a, r.av], [r.b, r.bv]].forEach(function (pair) {
          var c = pair[0], p = project(pair[1], 0.004);
          if (!p.front) return;
          var key = c.name;
          var prev = seen[key] || 0;
          var lvl = Math.max(prev, active ? 1 : 0.34);
          seen[key] = lvl;
          ctx.fillStyle = 'rgba(214,234,255,' + (0.25 + lvl * 0.7) + ')';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.6 + lvl * 1.6, 0, Math.PI * 2);
          ctx.fill();
          if (lvl > 0.9) {
            ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
            ctx.fillStyle = 'rgba(226,240,255,0.92)';
            ctx.textBaseline = 'middle';
            ctx.fillText(c.name.toUpperCase(), p.x + 9, p.y);
          }
        });
      }
    }

    /* ───────────────── interaction ───────────────── */

    canvas.addEventListener('pointerdown', function (e) {
      view.drag = true;
      view.lastX = e.clientX; view.lastY = e.clientY;
      view.idle = 0;
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('is-grabbing');
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!view.drag) return;
      var dx = e.clientX - view.lastX;
      var dy = e.clientY - view.lastY;
      view.lastX = e.clientX; view.lastY = e.clientY;
      view.tYaw += dx * 0.008;
      view.tPitch = U.clamp(view.tPitch + dy * 0.006, -1.2, 1.2);
      view.vYaw = dx * 0.008;
      state.selected = -1;
    });
    function endDrag(e) {
      if (!view.drag) return;
      view.drag = false;
      view.idle = 0;
      canvas.classList.remove('is-grabbing');
    }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    /* ───────────────── the frame ───────────────── */

    var sub = AX.add(function (dt, now) {
      if (!state.visible) return;
      fit();

      if (!view.drag) {
        view.idle += dt;
        if (state.selected >= 0) {
          /* ease the selected route into view, centred on its midpoint */
          var r = routes[state.selected];
          var mid = slerp(r.av, r.bv, 0.5);
          var lat = Math.asin(U.clamp(mid[1], -1, 1));
          var lon = Math.atan2(mid[2], mid[0]);
          view.tYaw = -lon;
          view.tPitch = U.clamp(lat * 0.85, -1.0, 1.0);
        } else if (view.idle > 1.2 && !AX.reduced()) {
          view.tYaw += view.spin * dt;
        }
      }

      view.yaw = U.damp(view.yaw, view.tYaw, view.drag ? 22 : 4.2, dt);
      view.pitch = U.damp(view.pitch, view.tPitch, view.drag ? 22 : 4.2, dt);
      refreshTrig();

      /* range gating against the selected aircraft */
      var rng = state.aircraft ? state.aircraft.range_km : 1e9;
      for (var i = 0; i < routes.length; i++) {
        routes[i].reach = routes[i].km <= rng ? 1 : 0;
      }

      ctx.clearRect(0, 0, W, H);
      drawSphere();
      drawGraticule();
      drawRoutes(dt);
      drawCities();
    }, 'globe');

    return {
      routes: routes,
      setAircraft: function (a) { state.aircraft = a; },
      setHover: function (i) { state.hover = i; },
      select: function (i) { state.selected = i; view.idle = 0; },
      setVisible: function (v) { state.visible = v; sub.active = v; },
      /* flight time at the type's cruise Mach, ISA cruise altitude,
         plus a fixed 25 min taxi/climb/approach allowance */
      blockTime: function (km, mach) {
        var gs = (mach || 0.82) * 573;   /* kt TAS at FL350 ≈ M × 573 */
        var hrs = (km / 1.852) / gs + 0.42;
        return { h: Math.floor(hrs), m: Math.round((hrs % 1) * 60) };
      }
    };
  }

  AX.globe = { init: init, CITIES: CITIES };

})(window);
