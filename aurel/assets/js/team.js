/* ═══════════════════════════════════════════════════════════
   team.js — four clinicians, alternating down the page.

   Not a grid of employee cards. Each clinician gets a full
   width band with the portrait on the opposite side to the one
   above, which gives the section a rhythm you can feel while
   scrolling past it and stops the four of them reading as
   interchangeable staff.

   The profile expands in place, on the same height transition
   the treatments index uses, because two different expand
   animations on one page is one too many.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var AUREL = global.AUREL, el = AUREL.el, $ = AUREL.$;
  var roster = $('#roster');
  if (!roster) return;

  var D = AUREL.DENTISTS;
  var open = null;

  D.forEach(function (d, i) {
    var art = el('article', 'dr reveal');
    art.setAttribute('data-side', i % 2 ? 'right' : 'left');
    art.setAttribute('data-reveal', String(i % 2));

    var fig = el('figure', 'dr__fig');
    fig.appendChild(AUREL.MEDIA.node(d.media, 'media--portrait'));
    fig.appendChild(el('figcaption', 'dr__figcap', String(d.years) + ' years in practice'));

    var main = el('div', 'dr__main');
    main.innerHTML =
      '<p class="dr__role">' + d.role + '</p>' +
      '<h3 class="dr__name">' + d.name + '</h3>' +
      '<p class="dr__cred">' + d.cred + '</p>';

    var btn = el('button', 'dr__toggle');
    btn.type = 'button';
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'dr-' + d.id);
    btn.innerHTML = '<span class="dr__toggle-t">Read profile</span>' +
                    '<span class="dr__toggle-m" aria-hidden="true"><i></i><i></i></span>';

    var panel = el('div', 'dr__panel');
    panel.id = 'dr-' + d.id;
    panel.hidden = true;

    var inner = el('div', 'dr__panel-in');
    var bio = el('p', 'dr__bio', d.bio);

    var listWrap = el('div', 'dr__does');
    listWrap.appendChild(el('p', 'lbl', 'Takes on'));
    var ul = el('ul');
    d.does.forEach(function (x) { ul.appendChild(el('li', null, x)); });
    listWrap.appendChild(ul);

    var meta = el('dl', 'dr__meta');
    [['Languages', d.langs], ['Experience', d.years + ' years']].forEach(function (m) {
      var w = el('div');
      w.appendChild(el('dt', null, m[0]));
      w.appendChild(el('dd', null, m[1]));
      meta.appendChild(w);
    });

    var cta = el('a', 'btn btn--ghost dr__cta', 'Book with ' + d.name.split(' ').slice(0, 2).join(' '));
    cta.href = '#book';
    cta.setAttribute('data-book-dr', d.id);
    cta.setAttribute('data-magnetic', '');

    inner.appendChild(bio);
    inner.appendChild(listWrap);
    inner.appendChild(meta);
    inner.appendChild(cta);
    panel.appendChild(inner);

    main.appendChild(btn);
    main.appendChild(panel);

    art.appendChild(fig);
    art.appendChild(main);
    roster.appendChild(art);

    btn.addEventListener('click', function () { toggle(art, btn, panel); });
  });

  function toggle(art, btn, panel) {
    var isOpen = art.classList.contains('is-open');
    if (open && open !== art) shut(open);
    if (isOpen) { shut(art); open = null; return; }

    open = art;
    art.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    btn.querySelector('.dr__toggle-t').textContent = 'Close profile';
    panel.hidden = false;

    if (AUREL.reduced()) { panel.style.height = 'auto'; AUREL.measure(); return; }
    var h = panel.scrollHeight;
    panel.style.height = '0px';
    void panel.offsetHeight;
    panel.style.height = h + 'px';
    panel.addEventListener('transitionend', function once(e) {
      if (e.propertyName !== 'height') return;
      panel.removeEventListener('transitionend', once);
      panel.style.height = 'auto';
      AUREL.measure(); AUREL.wake();
    });
  }

  function shut(art) {
    var panel = art.querySelector('.dr__panel');
    var btn = art.querySelector('.dr__toggle');
    art.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    btn.querySelector('.dr__toggle-t').textContent = 'Read profile';

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

  /* ── booking step 2 ──────────────────────────────────────
     "No preference" first, and it is the honest default: most
     people do not have one, and a step that forces an opinion
     they do not hold is a step they abandon. */
  var opts = $('#optdr');
  if (opts) {
    var any = el('label', 'opt opt--dr opt--any');
    any.innerHTML =
      '<input type="radio" name="dentist" value="any" checked>' +
      '<span class="opt__in">' +
        '<span class="opt__name">No preference</span>' +
        '<span class="opt__meta">We will match you to the right specialist</span>' +
      '</span>';
    opts.appendChild(any);

    D.forEach(function (d) {
      var lab = el('label', 'opt opt--dr');
      lab.innerHTML =
        '<input type="radio" name="dentist" value="' + d.id + '">' +
        '<span class="opt__in">' +
          '<span class="opt__name">' + d.name + '</span>' +
          '<span class="opt__meta">' + d.role + '</span>' +
        '</span>';
      opts.appendChild(lab);
    });
  }

  global.document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-book-dr]');
    if (!a) return;
    var input = global.document.querySelector('input[name="dentist"][value="' + a.getAttribute('data-book-dr') + '"]');
    if (input) { input.checked = true; input.dispatchEvent(new global.Event('change', { bubbles: true })); }
  });
})(window);
