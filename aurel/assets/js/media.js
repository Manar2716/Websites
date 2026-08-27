/* ═══════════════════════════════════════════════════════════
   media.js — every photograph on this site, in one table.

   THE POINT OF THIS FILE
   ----------------------
   Photography is the primary asset of a dental site, and this
   one is built so that adding a photograph is *only* adding a
   file. Drop `tooth-specimen.png` into assets/img/ and the hero
   and the anatomy study both pick it up on the next reload.
   There is no manifest to keep in sync, no build step and no
   list to edit: each slot below carries a base name, and the
   loader probes the modern formats in order —

       .avif → .webp → .png → .jpg → .jpeg

   — taking the first one that decodes. A slot whose file is not
   there yet renders a PLATE instead: a contact-sheet card
   carrying the slot id, the subject the photograph is meant to
   be, and the crop it needs. That is deliberate. A missing
   photograph should look like an art-direction card waiting to
   be filled, not like a broken page, and it should tell whoever
   opens the folder exactly what to shoot.

   THE WHITE-BACKGROUND TRICK
   --------------------------
   The two tooth renders this site was designed around are white
   objects on a white ground. Rather than cutting them out, the
   specimen slots composite with `mix-blend-mode: multiply` (see
   .media--specimen in the stylesheet): against ivory, white
   multiplies to ivory and disappears completely, while every
   grey in the shading survives untouched. The result is an
   object sitting in the page with no visible image box, from a
   file that still has its background. It is also why every
   section that carries the specimen is on a light ground —
   multiply against navy would sink the whole object.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var AUREL = (global.AUREL = global.AUREL || {});
  var doc = global.document;
  var DIR = 'assets/img/';
  var EXT = ['avif', 'webp', 'png', 'jpg', 'jpeg'];

  /* ── the slots ───────────────────────────────────────────
     `subject` is written for whoever is taking the photograph;
     it is what the plate prints. `alt` is written for whoever
     is listening to the page. They are not the same sentence
     and should not be collapsed into one. */
  var SLOTS = {
    'tooth-specimen': {
      subject: 'Molar render, three-quarter view, white on white',
      crop: 'Square-ish · 1600px min · background left in',
      alt: 'A mandibular first molar rendered in white, seen from the front, its three roots spread below the crown.'
    },
    'tooth-specimen-wide': {
      subject: 'Molar render, wider crop, room above and below',
      crop: '16:9 · 1600px min · background left in',
      alt: 'The same molar rendered in white, framed wide with space around it.'
    },
    'studio-interior': {
      subject: 'Surgery interior — chair, window light, no people',
      crop: '3:4 portrait · 1600px min',
      alt: 'A treatment room at the studio, lit from a window.'
    },
    'clinic-facade': {
      subject: 'Entrance at dusk — signage legible, Gate Village stone',
      crop: '4:3 · 2000px min',
      alt: 'The entrance to the studio in Gate Village at dusk.'
    },
    'case-before': {
      subject: 'Case 041, before — retracted anterior, calibrated light',
      crop: '4:3 · identical crop and lighting to case-after',
      alt: 'Case 041 photographed before treatment.'
    },
    'case-after': {
      subject: 'Case 041, after — same camera, same light, same crop',
      crop: '4:3 · identical crop and lighting to case-before',
      alt: 'Case 041 photographed after treatment.'
    },
    'dr-haddad':  { subject: 'Dr Yara Haddad — portrait, natural light',   crop: '4:5 · 1200px min', alt: 'Portrait of Dr Yara Haddad.' },
    'dr-rahman':  { subject: 'Dr Elias Rahman — portrait, natural light',  crop: '4:5 · 1200px min', alt: 'Portrait of Dr Elias Rahman.' },
    'dr-albakri': { subject: 'Dr Noor Al-Bakri — portrait, natural light', crop: '4:5 · 1200px min', alt: 'Portrait of Dr Noor Al-Bakri.' },
    'dr-okonkwo': { subject: 'Dr Sami Okonkwo — portrait, natural light',  crop: '4:5 · 1200px min', alt: 'Portrait of Dr Sami Okonkwo.' },

    /* One per treatment, shown in the panel that opens under
       the index row. Only one panel is open at a time, so at
       most one of these is ever on screen. */
    'tx-general':    { subject: 'Examination in progress — loupes, mirror, no faces', crop: '4:3 · 1600px min', alt: 'An examination under way in the studio.' },
    'tx-cosmetic':   { subject: 'Shade tab held against a trial smile',                crop: '4:3 · 1600px min', alt: 'A shade tab held up during a cosmetic assessment.' },
    'tx-whitening':  { subject: 'Whitening trays on the bench, shade guide beside',    crop: '4:3 · 1600px min', alt: 'Whitening trays and a shade guide on the bench.' },
    'tx-veneers':    { subject: 'Veneers on the ceramics bench, raking light',         crop: '4:3 · 1600px min', alt: 'Porcelain veneers on the ceramics bench.' },
    'tx-implants':   { subject: 'Printed surgical guide and implant components',       crop: '4:3 · 1600px min', alt: 'A printed surgical guide with implant components.' },
    'tx-ortho':      { subject: 'Archwire and brackets, macro on the instrument tray', crop: '4:3 · 1600px min', alt: 'Orthodontic brackets and an archwire on a tray.' },
    'tx-invisalign': { subject: 'Aligner held to the window, scan on screen behind',   crop: '4:3 · 1600px min', alt: 'A clear aligner held up in front of a scan on screen.' },
    'tx-preventive': { subject: 'Hygiene instruments laid out, top-down',              crop: '4:3 · 1600px min', alt: 'Hygiene instruments laid out on a tray.' }
  };

  /* ── resolver ────────────────────────────────────────────
     One probe per slot for the whole page, cached and shared:
     the specimen appears in three places and must not be
     fetched three times. Probing is done with an Image rather
     than fetch/HEAD so a hit lands in the cache already
     decoded — the visible <img> that follows is then free. */
  var cache = {};
  /* Once one slot resolves, every later slot tries that
     extension first. A folder of .webp then costs one request
     per slot instead of three, and — more to the point — a
     folder with nothing in it yet does not fire a burst of
     404s at the moment the page loads. */
  var learned = null;

  function resolve(id, cb) {
    var hit = cache[id];
    if (hit && hit.done) { cb(hit.src); return; }
    if (hit) { hit.waiting.push(cb); return; }

    hit = cache[id] = { done: false, src: null, waiting: [cb] };

    var order = learned ? [learned].concat(EXT.filter(function (e) { return e !== learned; })) : EXT;
    var i = 0;
    (function next() {
      if (i >= order.length) { settle(null); return; }
      var ext = order[i++];
      var url = DIR + id + '.' + ext;
      var probe = new global.Image();
      probe.onload = function () {
        if (probe.naturalWidth) learned = ext;
        settle(probe.naturalWidth ? url : null);
      };
      probe.onerror = next;
      probe.src = url;
    })();

    function settle(src) {
      hit.done = true; hit.src = src;
      for (var k = 0; k < hit.waiting.length; k++) hit.waiting[k](src);
      hit.waiting.length = 0;
    }
  }

  /* ── the plate ───────────────────────────────────────────
     Registration marks in the corners, the slot id, the
     subject, the crop. It is a printer's contact sheet, and
     it is the reason a photograph-less build still looks
     art-directed rather than unfinished. */
  var seq = 0;

  function plate(id, n) {
    var slot = SLOTS[id] || {};
    var wrap = doc.createElement('div');
    wrap.className = 'plate';
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', 'Photograph pending: ' + (slot.subject || id));

    var marks = '';
    for (var c = 0; c < 4; c++) marks += '<span class="plate__reg" aria-hidden="true"></span>';

    wrap.innerHTML =
      marks +
      '<span class="plate__grid" aria-hidden="true"></span>' +
      '<span class="plate__body">' +
        '<span class="plate__n">PLATE ' + n + '</span>' +
        '<span class="plate__id">' + esc(id) + '</span>' +
        '<span class="plate__subject">' + esc(slot.subject || '') + '</span>' +
        '<span class="plate__crop">' + esc(slot.crop || '') + '</span>' +
      '</span>';
    return wrap;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch];
    });
  }

  /* ── fill one container ──────────────────────────────── */
  function fill(box) {
    var id = box.getAttribute('data-media');
    if (!id || box.getAttribute('data-filled')) return;
    box.setAttribute('data-filled', '1');
    /* numbered here rather than when the probe comes back, so
       the plates read 01, 02, 03 down the page instead of in
       whatever order the network settled */
    var n = ('0' + (++seq)).slice(-2);

    resolve(id, function (src) {
      if (!src) { box.appendChild(plate(id, n)); box.classList.add('is-plate'); return; }

      var img = doc.createElement('img');
      img.className = 'media__img';
      img.alt = (SLOTS[id] || {}).alt || '';
      img.decoding = 'async';
      /* the hero is the largest contentful paint on this page —
         it must not be lazy, and everything else must be */
      if (box.classList.contains('media--hero')) {
        img.loading = 'eager';
        img.setAttribute('fetchpriority', 'high');
      } else {
        img.loading = 'lazy';
      }
      img.addEventListener('load', function () {
        box.classList.add('is-loaded');
        if (AUREL.wake) AUREL.wake();
      });
      img.src = src;
      box.appendChild(img);
      box.classList.add('is-photo');
    });
  }

  /* ── lazy ────────────────────────────────────────────────
     Nothing is probed until it is within two screens of the
     viewport. `loading="lazy"` cannot help here because the
     probe happens before there is an <img> to be lazy, and a
     page with ten unfilled slots would otherwise open by
     firing every request it will ever make. */
  var watcher = global.IntersectionObserver ? new global.IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      if (!entries[i].isIntersecting) continue;
      watcher.unobserve(entries[i].target);
      fill(entries[i].target);
    }
  }, { rootMargin: '200% 0px' }) : null;

  function scan(scope) {
    var list = (scope || doc).querySelectorAll('[data-media]');
    for (var i = 0; i < list.length; i++) {
      /* the hero is above the fold by definition — never defer it */
      if (!watcher || list[i].classList.contains('media--hero')) fill(list[i]);
      else watcher.observe(list[i]);
    }
  }

  /* a media box built on demand, for the cards the scripts write */
  function node(id, cls) {
    var box = doc.createElement('div');
    box.className = 'media ' + (cls || '');
    box.setAttribute('data-media', id);
    if (watcher) watcher.observe(box); else fill(box);
    return box;
  }

  AUREL.MEDIA = { scan: scan, node: node, slots: SLOTS, resolve: resolve };
  scan();
})(window);
