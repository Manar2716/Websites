/* ═══════════════════════════════════════════════════════════
   clinic.js — the map.

   Drawn rather than embedded. An iframe from a map provider
   would drag in a third-party script, a cookie banner's worth
   of tracking and a colour palette nobody here chose, on a
   page whose whole argument is restraint. The blocks, roads
   and metro line in the markup are a stylised plan of the
   financial centre, not a survey, and the "get directions"
   button hands off to a real map for the part that has to be
   accurate.

   Wheel-to-zoom is off until the map is clicked. A map that
   swallows the scroll wheel the moment the cursor crosses it
   is the single most hated widget on the web — you lose your
   place on the page and end up somewhere in the Gulf.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var AUREL = global.AUREL, U = AUREL.U, $ = AUREL.$, $$ = AUREL.$$;
  var doc = global.document;
  var map = $('#map'), svg = $('#mapsvg'), world = $('#mapworld');
  var tip = $('#maptip'), hint = $('#maphint');
  if (!map || !svg) return;

  var s = 1, tx = 0, ty = 0;                    /* target */
  var cs = 1, cx = 0, cy = 0;                   /* current, damped */
  var engaged = false, dragging = false, moved = 0;
  var px = 0, py = 0;

  var MIN = 1, MAX = 3.6, W = 800, H = 520;

  function clampPan() {
    /* keep the drawing covering the frame at every zoom */
    var mx = (W * (s - 1)) / 2, my = (H * (s - 1)) / 2;
    tx = U.clamp(tx, -mx, mx);
    ty = U.clamp(ty, -my, my);
  }

  function paint() {
    world.setAttribute('transform',
      'translate(' + U.round(cx, 2) + ' ' + U.round(cy, 2) + ') ' +
      'scale(' + U.round(cs, 4) + ')');
    /* the marker and the labels counter-scale, so a zoomed map
       gains detail rather than just bigger dots */
    map.style.setProperty('--mz', U.round(cs, 3));
  }

  AUREL.sub(function (dt) {
    var d = Math.abs(cs - s) + Math.abs(cx - tx) + Math.abs(cy - ty);
    if (d < 0.02) {
      if (d > 0) { cs = s; cx = tx; cy = ty; paint(); }
      return false;
    }
    cs = U.damp(cs, s, 14, dt);
    cx = U.damp(cx, tx, 14, dt);
    cy = U.damp(cy, ty, 14, dt);
    paint();
    return true;
  });

  function zoomTo(next, ox, oy) {
    next = U.clamp(next, MIN, MAX);
    if (next === s) return;
    /* keep the point under the cursor where it is */
    if (ox != null) {
      var k = next / s;
      tx = ox - (ox - tx) * k;
      ty = oy - (oy - ty) * k;
    }
    s = next;
    clampPan();
    map.classList.toggle('is-zoomed', s > 1.02);
    AUREL.wake();
  }

  /* ── pan ─────────────────────────────────────────────── */
  svg.addEventListener('pointerdown', function (e) {
    dragging = true; moved = 0;
    px = e.clientX; py = e.clientY;
    map.classList.add('is-grab');
    try { svg.setPointerCapture(e.pointerId); } catch (err) {}
  });

  svg.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var r = svg.getBoundingClientRect();
    /* screen px → viewBox units, or the map slides at the
       wrong speed on every size but one */
    var k = W / (r.width || 1);
    var dx = (e.clientX - px) * k, dy = (e.clientY - py) * k;
    moved += Math.abs(dx) + Math.abs(dy);
    tx += dx; ty += dy;
    px = e.clientX; py = e.clientY;
    clampPan();
    AUREL.wake();
  });

  function endPan() {
    if (!dragging) return;
    dragging = false;
    map.classList.remove('is-grab');
  }
  svg.addEventListener('pointerup', function (e) {
    var wasDrag = moved > 6;
    endPan();
    if (!wasDrag) engage();
  });
  svg.addEventListener('pointercancel', endPan);

  /* ── engage ──────────────────────────────────────────── */
  function engage() {
    if (engaged) return;
    engaged = true;
    map.classList.add('is-live');
    if (hint) hint.textContent = 'Drag to move · scroll to zoom · Esc to release';
  }
  function release() {
    if (!engaged) return;
    engaged = false;
    map.classList.remove('is-live');
    if (hint) hint.textContent = 'Drag to move · click the map, then scroll to zoom';
  }

  svg.addEventListener('wheel', function (e) {
    if (!engaged) return;            /* let the page have it */
    e.preventDefault();
    var r = svg.getBoundingClientRect();
    var k = W / (r.width || 1);
    var ox = (e.clientX - r.left) * k - W / 2;
    var oy = (e.clientY - r.top) * k - H / 2;
    zoomTo(s * (e.deltaY < 0 ? 1.14 : 1 / 1.14), ox, oy);
  }, { passive: false });

  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') release(); });
  doc.addEventListener('pointerdown', function (e) { if (!map.contains(e.target)) release(); });

  $('#mapin').addEventListener('click', function () { engage(); zoomTo(s * 1.35); });
  $('#mapout').addEventListener('click', function () { zoomTo(s / 1.35); if (s <= MIN + 0.001) { tx = ty = 0; } });

  /* ── points of interest ──────────────────────────────────
     Keyboard reachable, because a map whose only content is in
     hover states has no content for anyone not using a mouse. */
  function showTip(node, text) {
    var r = node.getBoundingClientRect();
    var f = map.querySelector('.map__frame').getBoundingClientRect();
    tip.textContent = text;
    tip.hidden = false;
    /* measure after filling, then keep it inside the frame */
    var w = tip.offsetWidth;
    var x = U.clamp(r.left + r.width / 2 - f.left, w / 2 + 8, f.width - w / 2 - 8);
    tip.style.setProperty('--x', x + 'px');
    tip.style.setProperty('--y', (r.top - f.top - 14) + 'px');
    tip.classList.add('is-on');
  }
  function hideTip() { tip.classList.remove('is-on'); }

  $$('.map__poi', svg).forEach(function (g) {
    var text = g.getAttribute('data-poi');
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'img');
    g.setAttribute('aria-label', text);
    ['pointerenter', 'focus'].forEach(function (ev) {
      g.addEventListener(ev, function () { showTip(g, text); });
    });
    ['pointerleave', 'blur'].forEach(function (ev) {
      g.addEventListener(ev, hideTip);
    });
  });

  var pin = $('#mappin');
  if (pin) {
    pin.setAttribute('tabindex', '0');
    pin.setAttribute('role', 'img');
    pin.setAttribute('aria-label', 'AUREL Dental Studio — Gate Village 4, Level 2');
    ['pointerenter', 'focus'].forEach(function (ev) {
      pin.addEventListener(ev, function () { showTip(pin, 'AUREL — Gate Village 4, Level 2'); });
    });
    ['pointerleave', 'blur'].forEach(function (ev) { pin.addEventListener(ev, hideTip); });
  }

  tip.addEventListener('transitionend', function () {
    if (!tip.classList.contains('is-on')) tip.hidden = true;
  });

  /* ── open now ────────────────────────────────────────────
     The opening table is static markup; this marks today's row
     and says whether the studio is open at this moment. It is
     the one piece of information a contact section can give
     that a printed card cannot. */
  var rows = $$('.hrs tr');
  var now = new Date();
  var dow = now.getDay();                     /* 0 Sun … 6 Sat */
  var idx = dow === 0 ? 3 : dow === 5 ? 1 : dow === 6 ? 2 : 0;
  if (rows[idx]) {
    rows[idx].classList.add('is-today');
    var mins = now.getHours() * 60 + now.getMinutes();
    var band = dow === 0 ? null : dow === 5 ? [540, 1020] : dow === 6 ? [600, 960] : [540, 1200];
    var openNow = band && mins >= band[0] && mins < band[1];
    var flag = AUREL.el('span', 'hrs__now', openNow ? 'Open now' : 'Closed now');
    flag.className += openNow ? ' is-open' : '';
    rows[idx].querySelector('td').appendChild(flag);
  }
})(window);
