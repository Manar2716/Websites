/* ═══════════════════════════════════════════════════════════
   site.js — the parts of the page that are not the renderer.

   The nav, the reveals, whether the restaurant is open right
   now, the booking form, and the chrome around the table.

   Two things in here are worth knowing about.

   The **menu is in the markup**, not built from `SP.MENU` at
   runtime. Every dish, description and price is served as HTML
   and this file only attaches behaviour to it. Building it in
   JavaScript would have been fewer lines and would have meant
   that a browser with scripting off gets an empty section where
   the menu should be — for a restaurant, the menu is the one
   thing on the site that has to survive everything.

   The **booking form does not book**. Shrimparty takes
   reservations on the telephone, so the form composes the
   message and hands it to the phone or the mail client. A form
   that posts into the void and says "thanks, you're booked"
   would be worse than no form.
   ═══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SP = (global.SP = global.SP || {});
  var doc = document;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };

  SP.Site = function (opts) {
    opts = opts || {};
    var onOpenTable = opts.onOpenTable || function () {};
    var onCloseTable = opts.onCloseTable || function () {};

    /* ── nav ──────────────────────────────────────────────── */
    var nav = $('#nav'), links = $('#navlinks'), toggle = $('#navtoggle');
    var navOpen = false;
    function setNav(v) {
      navOpen = v;
      links.classList.toggle('is-open', v);
      toggle.setAttribute('aria-expanded', v ? 'true' : 'false');
    }
    toggle.addEventListener('click', function () { setNav(!navOpen); });
    links.addEventListener('click', function (e) {
      if (e.target.closest('a')) setNav(false);
    });

    /* ── reveals ───────────────────────────────────────────────
       An IntersectionObserver alone cannot drive reveals on a
       page with in-page links. It only fires on a *threshold
       crossing*, so jumping from the film straight to `#visit`
       takes everything in between from "below the fold, not
       intersecting" to "above the fold, not intersecting"
       without ever crossing the threshold: no entry is
       delivered and those sections sit at opacity 0 forever.
       The observer handles ordinary scrolling; a sweep handles
       the jumps. */
    var reveals = $$('[data-reveal]');
    var io = null;
    if (global.IntersectionObserver) {
      io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            entries[i].target.classList.add('is-in');
            io.unobserve(entries[i].target);
          }
        }
      }, { rootMargin: '0px 0px -8% 0px', threshold: .05 });
      reveals.forEach(function (el) { io.observe(el); });
    } else {
      reveals.forEach(function (el) { el.classList.add('is-in'); });
    }
    function sweepReveals() {
      var h = global.innerHeight;
      for (var i = 0; i < reveals.length; i++) {
        var el = reveals[i];
        if (el.classList.contains('is-in')) continue;
        if (el.getBoundingClientRect().top < h * .94) {
          el.classList.add('is-in');
          if (io) io.unobserve(el);
        }
      }
    }

    /* ── is it open right now ──────────────────────────────────
       Dubai is UTC+4 all year, so the local hour is computed
       from UTC rather than from the visitor's clock — someone
       reading this in London should be told whether the
       restaurant is open, not whether it would be open in
       London. */
    (function () {
      var el = $('#opennow');
      if (!el) return;
      function tick() {
        var now = new Date();
        var mins = (now.getUTCHours() * 60 + now.getUTCMinutes() + 240) % 1440;
        var day = (now.getUTCDay() + (now.getUTCHours() * 60 + now.getUTCMinutes() + 240 >= 1440 ? 1 : 0)) % 7;
        /* 5 = Friday, 6 = Saturday */
        var late = (day === 5 || day === 6) ? 90 : 60;      /* 01:30 or 01:00 */
        var open = mins >= 720 || mins < late;
        el.textContent = open ? 'Open now' : 'Closed — opens at 12:00';
        el.setAttribute('data-open', open ? 'yes' : 'no');
      }
      tick();
      setInterval(tick, 60000);
    })();

    /* ── booking ──────────────────────────────────────────── */
    (function () {
      var form = $('#bookform'), said = $('#booksaid');
      if (!form) return;
      var when = $('#b-when');
      if (when && !when.value) {
        var d = new Date(Date.now() + 864e5);
        when.value = d.toISOString().slice(0, 10);
      }
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var f = new FormData(form);
        var body =
          'Table request\n\n' +
          'Name: ' + (f.get('name') || '') + '\n' +
          'Date: ' + (f.get('when') || '') + '\n' +
          'Time: ' + (f.get('time') || '') + '\n' +
          'People: ' + (f.get('size') || '') + '\n\n' +
          'Sent from shrimparty.com';
        var href = 'mailto:info@shrimparty.com' +
          '?subject=' + encodeURIComponent('Table for ' + (f.get('size') || '') + ' on ' + (f.get('when') || '')) +
          '&body=' + encodeURIComponent(body);
        global.location.href = href;
        said.textContent = 'Opening your mail app. If nothing happens, call +971 4 255 0033.';
      });
    })();

    /* ══════════════════════════════════════════════════════════
       THE TABLE'S CHROME
       ══════════════════════════════════════════════════════════ */

    var table = $('#table');
    var capCat = $('#capcat'), capName = $('#capname'), capPrice = $('#capprice');
    var capDesc = $('#capdesc'), capCue = $('#capcue');
    var capOpen = $('#capopen'), capBack = $('#capback');
    var tPrev = $('#tprev'), tNext = $('#tnext'), tCount = $('#tcount');
    var tPart = $('#tablepart'), tCats = $('#tablecats');
    var isOn = false, lastFocus = null;

    /* category chips, built from the same data the markup was
       built from */
    SP.MENU.forEach(function (cat) {
      var b = doc.createElement('button');
      b.type = 'button';
      b.className = 'table__cat-btn';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', 'false');
      b.dataset.cat = cat.id;
      b.dataset.index = cat.dishes[0].index;
      b.textContent = cat.name;
      tCats.appendChild(b);
    });

    tCats.addEventListener('click', function (e) {
      var b = e.target.closest('.table__cat-btn');
      if (b) api.go(+b.dataset.index);
    });

    var api = {
      /* opened lazily by main.js, which owns the renderer */
      onGo: function () {},
      onOpenDish: function () {},
      onCloseDish: function () {},

      isOpen: function () { return isOn; },

      show: function (index) {
        if (isOn) { api.go(index || 0); return; }
        isOn = true;
        lastFocus = doc.activeElement;
        table.hidden = false;
        /* one frame between `hidden` coming off and the class
           going on, or the transition has nothing to run from */
        requestAnimationFrame(function () { table.classList.add('is-on'); });
        doc.body.classList.add('is-locked');
        setNav(false);
        onOpenTable(index || 0);
        capOpen.focus();
      },

      hide: function () {
        if (!isOn) return;
        isOn = false;
        table.classList.remove('is-on');
        doc.body.classList.remove('is-locked');
        onCloseTable();
        setTimeout(function () { if (!isOn) table.hidden = true; }, 400);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
      },

      go: function (i) { api.onGo(i); },

      /* the caption is rewritten whenever the rail settles on a
         new dish; `opened` switches the two buttons */
      setDish: function (dish, index, opened) {
        capCat.textContent = dish.catName;
        capName.textContent = dish.name;
        if (dish.price == null) {
          capPrice.textContent = 'Price not published — call to ask';
          capPrice.className = 'table__price table__price--none mono';
        } else {
          capPrice.textContent = 'AED ' + dish.price;
          capPrice.className = 'table__price mono';
        }
        if (dish.desc) {
          capDesc.textContent = dish.desc;
          capDesc.className = 'table__desc';
        } else {
          capDesc.textContent = 'Shrimparty does not publish a description for this one, so there is not one here.';
          capDesc.className = 'table__desc table__desc--none';
        }
        capCue.textContent = opened ? dish.cue : '';
        capOpen.hidden = !!opened;
        capBack.hidden = !opened;
        tCount.textContent = (index + 1) + ' / ' + SP.DISHES.length;
        tPrev.disabled = index <= 0;
        tNext.disabled = index >= SP.DISHES.length - 1;
        $$('.table__cat-btn', tCats).forEach(function (b) {
          b.setAttribute('aria-selected', b.dataset.cat === dish.cat ? 'true' : 'false');
        });
      },

      /* the ingredient readout: what the pointer is over, named */
      setPart: function (label) {
        if (label) {
          tPart.textContent = label;
          tPart.classList.add('is-on');
        } else {
          tPart.classList.remove('is-on');
        }
      },

      setCursor: function (over, dragging) {
        table.classList.toggle('is-over', !!over);
        table.classList.toggle('is-dragging', !!dragging);
      },

      sweepReveals: sweepReveals,
      setStuck: function (v) { nav.classList.toggle('is-stuck', v); }
    };

    capOpen.addEventListener('click', function () { api.onOpenDish(); });
    capBack.addEventListener('click', function () { api.onCloseDish(); });
    tPrev.addEventListener('click', function () { api.onGo(-1, true); });
    tNext.addEventListener('click', function () { api.onGo(1, true); });

    /* every route into the table: the nav, the captions in the
       film, and all thirty rows of the menu */
    $$('[data-open-table]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.dataset.dish;
        api.show(id && SP.BY_ID[id] ? SP.BY_ID[id].index : 0);
      });
    });
    $$('.dish[data-dish]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = SP.BY_ID[b.dataset.dish];
        api.show(d ? d.index : 0);
      });
    });

    doc.addEventListener('keydown', function (e) {
      if (!isOn) {
        if (e.key === 'Escape' && navOpen) setNav(false);
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); api.onCloseDish(true) || api.hide(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); api.onGo(1, true); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); api.onGo(-1, true); }
      else if (e.key === 'Enter' && doc.activeElement === doc.body) { e.preventDefault(); api.onOpenDish(); }
    });

    $('#tableclose').addEventListener('click', function () { api.hide(); });

    return api;
  };

})(window);
