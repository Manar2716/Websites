/* ═══════════════════════════════════════════════════════════
   compare.js — the before/after divider.

   Both photographs are stacked at identical size and the top
   one is clipped with `clip-path: inset()`. Clipping rather
   than resizing matters: a layer whose *width* animates
   squashes the photograph inside it, and a squashed before
   photograph next to an unsquashed after one is an accidental
   lie about the result.

   The position is a damped value driven from the loop, so a
   click on the far side glides across instead of jumping, and
   the drag has a little weight behind it.

   Touch: the box is `touch-action: pan-y`, so a horizontal
   drag moves the divider and a vertical one still scrolls the
   page. Making the whole box `touch-action: none` traps the
   page — a phone user who puts a thumb on the photograph to
   scroll would find the page stuck.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var AUREL = global.AUREL, U = AUREL.U, $ = AUREL.$;
  var doc = global.document;
  var fig = $('#cmp'), box = $('#cmpbox'), clip = $('#cmpclip');
  var handle = $('#cmphandle'), grip = $('#cmpgrip');
  if (!box) return;

  var pos = 50, target = 50, dragging = false, w = 0, left = 0;

  function measure() {
    var r = box.getBoundingClientRect();
    w = r.width; left = r.left;
  }
  measure();
  global.addEventListener('resize', measure, { passive: true });

  function paint() {
    var p = U.round(pos, 2);
    clip.style.setProperty('--pos', p + '%');
    handle.style.setProperty('--pos', p + '%');
    grip.setAttribute('aria-valuenow', String(Math.round(p)));
  }
  paint();

  AUREL.sub(function (dt) {
    if (Math.abs(target - pos) < 0.05) {
      if (pos !== target) { pos = target; paint(); }
      return false;
    }
    /* dragging tracks tightly; a click glides */
    pos = U.damp(pos, target, dragging ? 28 : 12, dt);
    paint();
    return true;
  });

  function set(clientX, snap) {
    if (!w) measure();
    target = U.clamp(((clientX - left) / w) * 100, 0, 100);
    if (snap) pos = target;
    AUREL.wake();
  }

  /* ── pointer ─────────────────────────────────────────────
     One handler set for mouse, pen and touch. Capture is taken
     on the grip so a drag that leaves the figure — which is
     most drags that reach 0% or 100% — keeps tracking. */
  function down(e) {
    dragging = true;
    fig.classList.add('is-dragging');
    measure();
    set(e.clientX, false);
    if (e.target.setPointerCapture) { try { e.target.setPointerCapture(e.pointerId); } catch (err) {} }
  }
  function move(e) { if (dragging) { e.preventDefault(); set(e.clientX, false); } }
  function up() { dragging = false; fig.classList.remove('is-dragging'); }

  grip.addEventListener('pointerdown', function (e) { e.preventDefault(); down(e); });
  box.addEventListener('pointerdown', function (e) {
    /* a press on the photograph itself walks the divider over,
       rather than doing nothing — the most common first gesture
       is a tap on the side you want to see */
    if (e.target.closest('.cmp__grip')) return;
    measure();
    set(e.clientX, false);
    dragging = true; fig.classList.add('is-dragging');
    if (box.setPointerCapture) { try { box.setPointerCapture(e.pointerId); } catch (err) {} }
  });
  doc.addEventListener('pointermove', move, { passive: false });
  doc.addEventListener('pointerup', up);
  doc.addEventListener('pointercancel', up);

  /* ── keyboard ────────────────────────────────────────────
     role="slider" in the markup, so this is the behaviour a
     screen reader has already promised its user. */
  grip.addEventListener('keydown', function (e) {
    var step = e.shiftKey ? 10 : 2, next = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = target - step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = target + step;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 100;
    else if (e.key === 'PageDown') next = target - 20;
    else if (e.key === 'PageUp') next = target + 20;
    if (next === null) return;
    e.preventDefault();
    target = U.clamp(next, 0, 100);
    AUREL.wake();
  });

  /* ── fullscreen ──────────────────────────────────────────
     Added from script and only where the API exists, so no
     browser is shown a button that does nothing. */
  var fsOK = fig.requestFullscreen || fig.webkitRequestFullscreen;
  if (fsOK) {
    var btn = AUREL.el('button', 'cmp__full');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'View the comparison full screen');
    btn.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">' +
      '<path d="M1.5 5.5v-4h4M14.5 5.5v-4h-4M1.5 10.5v4h4M14.5 10.5v4h-4" fill="none" ' +
      'stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    btn.addEventListener('click', function () {
      if (doc.fullscreenElement || doc.webkitFullscreenElement) {
        (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
      } else {
        (fig.requestFullscreen || fig.webkitRequestFullscreen).call(fig);
      }
    });
    box.appendChild(btn);
    doc.addEventListener('fullscreenchange', function () {
      fig.classList.toggle('is-full', !!doc.fullscreenElement);
      measure(); AUREL.wake();
    });
  }

  /* ── the invitation ──────────────────────────────────────
     The divider walks a few per cent off centre and back the
     first time the figure is properly on screen. It is the
     cheapest way to say "this thing moves" without a label
     saying "this thing moves", and it happens exactly once. */
  if (!AUREL.reduced() && global.IntersectionObserver) {
    var shown = false;
    var io = new global.IntersectionObserver(function (en) {
      if (!en[0].isIntersecting || shown) return;
      shown = true; io.disconnect();
      global.setTimeout(function () { target = 63; AUREL.wake(); }, 420);
      global.setTimeout(function () { target = 50; AUREL.wake(); }, 1350);
    }, { threshold: 0.55 });
    io.observe(fig);
  }
})(window);
