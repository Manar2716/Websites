/* Foto Fun Color Lab: small progressive enhancements.
   The page is complete without this file. It adds: the header's
   scrolled state, the mobile menu, gentle reveal-on-scroll, the
   "open now" status, the current nav item, and the mobile call bar. */

(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Header: background once the page has scrolled ---------- */

  var header = document.querySelector('[data-header]');
  var quickbar = document.querySelector('[data-quickbar]');
  var hero = document.querySelector('.hero');
  var footer = document.querySelector('.site-footer');
  var ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = window.scrollY;
      header.classList.toggle('is-scrolled', y > 8);

      if (quickbar) {
        // Show the call bar once the hero's own buttons are out of view,
        // and tuck it away again over the footer, which has the same links.
        var pastHero = hero ? y > hero.offsetHeight - 120 : y > 400;
        var atFooter = footer ? footer.getBoundingClientRect().top < window.innerHeight - 40 : false;
        quickbar.classList.toggle('is-visible', pastHero && !atFooter);
      }
      ticking = false;
    });
  }

  if (quickbar) document.body.classList.add('has-quickbar');
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile menu ---------- */

  var toggle = document.querySelector('[data-menu-toggle]');
  var menu = document.querySelector('[data-menu]');

  function setMenu(open) {
    toggle.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('is-open', open);
    root.classList.toggle('menu-open', open);
    if (open) {
      var first = menu.querySelector('a');
      if (first) first.focus({ preventScroll: true });
    }
  }

  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) {
        setMenu(false);
        toggle.focus();
      }
    });
    // Close it if the viewport grows past the mobile breakpoint.
    window.matchMedia('(min-width: 901px)').addEventListener('change', function (mq) {
      if (mq.matches) setMenu(false);
    });
  }

  /* ---------- Reveal on scroll ---------- */

  var reveals = document.querySelectorAll('.reveal');

  if (reduceMotion || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Current section in the nav ---------- */

  var navLinks = document.querySelectorAll('.nav__list a');
  if ('IntersectionObserver' in window && navLinks.length) {
    var byId = {};
    navLinks.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var link = byId[entry.target.id];
        if (!link) return;
        if (entry.isIntersecting) {
          navLinks.forEach(function (a) { a.removeAttribute('aria-current'); });
          link.setAttribute('aria-current', 'true');
        } else if (link.getAttribute('aria-current')) {
          link.removeAttribute('aria-current');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(byId).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) spy.observe(section);
    });
  }

  /* ---------- Open now ----------
     Based on the shop's regular hours: every day, 10:00 to 22:00,
     Dubai time (UTC+4 all year, no daylight saving). */

  var OPEN = 10, CLOSE = 22;

  function dubaiHour() {
    var now = new Date();
    var utc = now.getTime() + now.getTimezoneOffset() * 60000;
    var d = new Date(utc + 4 * 3600000);
    return d.getHours() + d.getMinutes() / 60;
  }

  function renderStatus() {
    var h = dubaiHour();
    var open = h >= OPEN && h < CLOSE;
    var text = open ? 'Open now · until 10 PM' : 'Closed now · opens at 10 AM';
    document.querySelectorAll('[data-open-status]').forEach(function (el) {
      el.textContent = text;
      el.classList.toggle('is-open', open);
      el.hidden = false;
    });
  }

  renderStatus();
  setInterval(renderStatus, 60000);

  /* ---------- Footer year ---------- */

  var year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();
})();
