/* ═══════════════════════════════════════════════════════════
   anatomy.js — the interactive study.

   One photograph of one tooth, four regions marked on it, and
   a panel that explains what goes wrong in each and what we do
   about it. Selecting a marker zooms the photograph *into that
   point* — scale with a transform-origin at the marker — which
   is a single composited transform and therefore free, and
   which reads like a clinician leaning in rather than like a
   lightbox opening.

   The markers live inside the zoomed element so they travel
   with the anatomy they label, and counter-scale by 1/z so
   they stay the same size on screen while the tooth grows
   under them. Getting that wrong — letting the dots inflate
   with the image — is what makes most zoom interactions feel
   like a broken PDF viewer.

   Region coordinates are percentages, and they live in
   data.js. See assets/img/README.md to re-calibrate them
   against a different photograph; it takes about a minute.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var AUREL = global.AUREL, U = AUREL.U, el = AUREL.el, $ = AUREL.$;
  var stage = $('#anatstage'), zoom = $('#anatzoom'), pins = $('#anatpins');
  var panel = $('#anatpanel'), reset = $('#anatreset');
  if (!stage || !zoom) return;

  var R = AUREL.REGIONS;
  var active = null;

  /* ── markers ─────────────────────────────────────────── */
  R.forEach(function (r, i) {
    var b = el('button', 'pin');
    b.type = 'button';
    b.id = 'pin-' + r.id;
    b.style.left = r.x + '%';
    b.style.top = r.y + '%';
    b.style.setProperty('--i', String(i));
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', r.label + ' — ' + r.title);
    b.innerHTML =
      '<span class="pin__ring" aria-hidden="true"></span>' +
      '<span class="pin__dot" aria-hidden="true"></span>' +
      '<span class="pin__label">' + r.label + '</span>';
    b.addEventListener('click', function () { select(active === r ? null : r); });
    pins.appendChild(b);
  });

  /* ── select ──────────────────────────────────────────── */
  function select(r) {
    active = r;

    var z = r ? r.z : 1;
    zoom.style.setProperty('--z', String(z));
    zoom.style.transformOrigin = r ? (r.x + '% ' + r.y + '%') : '50% 50%';
    stage.classList.toggle('is-zoomed', !!r);
    reset.hidden = !r;

    R.forEach(function (x) {
      var b = document.getElementById('pin-' + x.id);
      b.setAttribute('aria-pressed', String(x === r));
      b.classList.toggle('is-on', x === r);
      /* the unselected markers step back rather than vanish, so
         it stays obvious that there are three more to look at */
      b.classList.toggle('is-off', !!r && x !== r);
    });

    render(r);
    AUREL.wake();
  }

  /* ── the panel ───────────────────────────────────────────
     Rebuilt rather than mutated, so the entrance animation
     replays on every selection. It is aria-live in the markup,
     which means the new text is announced without moving
     anyone's focus off the marker they just pressed. */
  function render(r) {
    var box = el('div', 'anat__panel-in');

    if (!r) {
      box.setAttribute('data-empty', '');
      box.innerHTML =
        '<p class="eyebrow">Select a region</p>' +
        '<p class="anat__hint">Enamel, dentine, pulp and the gingival margin each fail in a ' +
        'different way — and each has its own treatment.</p>';
    } else {
      var tx = (AUREL.TREATMENTS.filter(function (t) { return t.id === r.tx; })[0] || {});
      box.innerHTML =
        '<p class="eyebrow">' + r.label + '</p>' +
        '<h3 class="anat__h">' + r.title + '</h3>' +
        '<p class="anat__body">' + r.body + '</p>' +
        '<a class="btn btn--ghost anat__cta" href="#book" data-book-tx="' + r.tx + '" data-magnetic>' +
          r.cta + '</a>' +
        (tx.name ? '<p class="anat__ref">Treated under <em>' + tx.name + '</em></p>' : '');
    }
    panel.replaceChildren(box);
  }

  reset.addEventListener('click', function () {
    select(null);
    var first = pins.querySelector('.pin');
    if (first) first.focus({ preventScroll: true });
  });

  /* escape backs out, from anywhere inside the study */
  stage.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && active) { e.preventDefault(); select(null); }
  });

  /* ── drift ───────────────────────────────────────────────
     The specimen rides the section's own scroll progress
     rather than a clock: about eighteen pixels of travel
     across the whole section, and it comes to REST when the
     page does.

     It was a slow sine at first, and that was wrong twice
     over. A permanent animation holds the frame loop awake for
     as long as the section is on screen, and — the part that
     is easy to miss until you try to use it — it means the
     four markers are never once stationary, so a cursor
     hovering one is chasing a target that is still moving. It
     also has no way to honour a person who has asked for less
     motion beyond switching itself off entirely.

     Scroll-linked has none of those problems: no scroll, no
     work, no movement, and it stops dead the moment a region
     is open and the person is reading. */
  if (!AUREL.reduced()) {
    AUREL.track(stage, function (p) {
      if (active) { zoom.style.setProperty('--drift', '0px'); return; }
      zoom.style.setProperty('--drift', U.round((p - 0.5) * -18, 2) + 'px');
    });
  }
})(window);
