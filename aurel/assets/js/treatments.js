/* ═══════════════════════════════════════════════════════════
   treatments.js — the index, and the panel that opens under it.

   Deliberately not a card grid. Eight identical rounded cards
   is the single most template-looking thing a clinic site can
   do; a numbered index with a rule between each line is how a
   printed contents page does it, and it survives being read at
   any width.

   Rows are <button aria-expanded> inside <li>, so the whole
   thing is a keyboard list for free and screen readers announce
   the open state without any aria bookkeeping.

   The panel animates on height, which is a layout property and
   therefore the one exception to this project's transform-only
   rule. It is affordable because it happens once per click and
   never during a scroll; the alternative — a scaled wrapper —
   distorts the type while it moves, which looks cheap.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var AUREL = global.AUREL, U = AUREL.U, el = AUREL.el, $ = AUREL.$;
  var doc = global.document;
  var list = $('#txlist'), peek = $('#txpeek'), peekIn = peek && peek.firstElementChild;
  if (!list) return;

  var TX = AUREL.TREATMENTS;
  var openRow = null;

  /* ── build ───────────────────────────────────────────── */
  TX.forEach(function (t, i) {
    var li = el('li', 'tx__row reveal');
    li.setAttribute('data-tx', t.id);
    li.setAttribute('data-reveal', String(i % 4));

    var btn = el('button', 'tx__btn');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'txp-' + t.id);
    btn.innerHTML =
      '<span class="tx__n">' + t.n + '</span>' +
      '<span class="tx__name">' + t.name + '</span>' +
      '<span class="tx__kick">' + t.kicker + '</span>' +
      '<span class="tx__mark" aria-hidden="true"><i></i><i></i></span>';

    var panel = el('div', 'tx__panel');
    panel.id = 'txp-' + t.id;
    panel.hidden = true;

    var inner = el('div', 'tx__panel-in');

    var fig = el('figure', 'tx__fig');
    fig.appendChild(AUREL.MEDIA.node('tx-' + t.id, 'media--tx'));

    var text = el('div', 'tx__text');
    var p = el('p', 'tx__body', t.body);
    var dl = el('dl', 'tx__facts');
    t.facts.forEach(function (f) {
      var d = el('div');
      d.appendChild(el('dt', null, f[0]));
      d.appendChild(el('dd', null, f[1]));
      dl.appendChild(d);
    });
    var cta = el('a', 'btn btn--solid tx__cta', 'Book ' + t.name.toLowerCase());
    cta.href = '#book';
    cta.setAttribute('data-book-tx', t.id);
    cta.setAttribute('data-magnetic', '');

    text.appendChild(p); text.appendChild(dl); text.appendChild(cta);
    inner.appendChild(fig); inner.appendChild(text);
    panel.appendChild(inner);

    li.appendChild(btn); li.appendChild(panel);
    list.appendChild(li);

    btn.addEventListener('click', function () { toggle(li); });
  });

  /* ── open / close ────────────────────────────────────────
     One at a time. Two open panels turn the index back into a
     wall of text, which is the thing the index exists to avoid. */
  function toggle(li) {
    if (openRow === li) { close(li); openRow = null; return; }
    if (openRow) close(openRow);
    openRow = li;
    openIt(li);
  }

  function openIt(li) {
    var panel = li.querySelector('.tx__panel');
    var btn = li.querySelector('.tx__btn');
    btn.setAttribute('aria-expanded', 'true');
    li.classList.add('is-open');
    panel.hidden = false;

    if (AUREL.reduced()) { panel.style.height = 'auto'; done(); return; }

    var h = panel.scrollHeight;
    panel.style.height = '0px';
    /* force a style resolution so the browser has a start value */
    void panel.offsetHeight;
    panel.style.height = h + 'px';
    panel.addEventListener('transitionend', function once(e) {
      if (e.propertyName !== 'height') return;
      panel.removeEventListener('transitionend', once);
      /* release to auto, or a panel whose image loads late clips */
      panel.style.height = 'auto';
      done();
    });

    function done() { AUREL.measure(); AUREL.wake(); }
  }

  function close(li) {
    var panel = li.querySelector('.tx__panel');
    var btn = li.querySelector('.tx__btn');
    btn.setAttribute('aria-expanded', 'false');
    li.classList.remove('is-open');

    if (AUREL.reduced()) { panel.hidden = true; panel.style.height = ''; AUREL.measure(); return; }

    panel.style.height = panel.scrollHeight + 'px';
    void panel.offsetHeight;
    panel.style.height = '0px';
    panel.addEventListener('transitionend', function once(e) {
      if (e.propertyName !== 'height') return;
      panel.removeEventListener('transitionend', once);
      panel.hidden = true;
      panel.style.height = '';
      AUREL.measure();
    });
  }

  /* ── the peek ────────────────────────────────────────────
     A card that trails the cursor over the index, carrying the
     numeral, the name and the starting price of the row under
     the pointer. It is type rather than a photograph on
     purpose: eight photographs of dentistry, shown at 260px
     while the cursor is moving, would all read as the same
     pink smear. The numeral does not.

     Pointer-only. It never appears on touch, where there is no
     cursor for it to trail and no hover state to preview. */
  if (peek && global.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    var px = 0, py = 0, tx = 0, ty = 0, on = false, current = null;

    list.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var r = list.getBoundingClientRect();
      tx = e.clientX - r.left; ty = e.clientY - r.top;

      var row = e.target.closest('.tx__row');
      var id = row && !row.classList.contains('is-open') ? row.getAttribute('data-tx') : null;
      if (id !== current) {
        current = id;
        if (id) {
          var t = TX.filter(function (x) { return x.id === id; })[0];
          var price = (t.facts.filter(function (f) { return f[0] === 'From'; })[0] || [])[1] || '';
          peekIn.innerHTML =
            '<span class="tx__peek-n">' + t.n + '</span>' +
            '<span class="tx__peek-name">' + t.name + '</span>' +
            (price ? '<span class="tx__peek-price">from ' + price.replace('AED ', 'AED&nbsp;') + '</span>' : '');
        }
        peek.classList.toggle('is-on', !!id);
        if (!on) { px = tx; py = ty; on = true; }
      }
      AUREL.wake();
    });

    list.addEventListener('pointerleave', function () {
      current = null; on = false;
      peek.classList.remove('is-on');
    });

    AUREL.sub(function (dt) {
      if (!on) return false;
      var dx = tx - px, dy = ty - py;
      if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) return false;
      /* the lag is the whole effect — a card pinned exactly to
         the cursor reads as a tooltip, one that trails reads
         as weight */
      px = U.damp(px, tx, 13, dt);
      py = U.damp(py, ty, 13, dt);
      peek.style.transform = 'translate3d(' + U.round(px, 1) + 'px,' + U.round(py, 1) + 'px,0)';
      return true;
    });
  }

  /* ── booking step 1 ──────────────────────────────────────
     Same table, different shape. Written here rather than in
     booking.js so the treatment list only ever has one author. */
  var opts = $('#opttx');
  if (opts) {
    TX.forEach(function (t) {
      /* the starting price, not the first fact — the first fact
         is a duration for some treatments and a planning window
         for others, and "Two weeks" under Cosmetic Dentistry
         reads as an appointment length */
      var from = (t.facts.filter(function (f) { return f[0] === 'From'; })[0] || [])[1] || '';
      var lab = el('label', 'opt opt--tx');
      lab.innerHTML =
        '<input type="radio" name="treatment" value="' + t.id + '">' +
        '<span class="opt__in">' +
          '<span class="opt__n">' + t.n + '</span>' +
          '<span class="opt__name">' + t.name + '</span>' +
          '<span class="opt__meta">from ' + from + '</span>' +
        '</span>';
      opts.appendChild(lab);
    });
  }

  /* a "book this treatment" button preselects its own row */
  doc.addEventListener('click', function (e) {
    var a = e.target.closest('[data-book-tx]');
    if (!a) return;
    var input = doc.querySelector('input[name="treatment"][value="' + a.getAttribute('data-book-tx') + '"]');
    if (input) { input.checked = true; input.dispatchEvent(new global.Event('change', { bubbles: true })); }
  });
})(window);
