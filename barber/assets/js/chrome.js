/* ==========================================================================
   Page chrome shared by the public pages: theme, the demo banner, the
   sticky header, the mobile menu, and the bits of the header and footer
   that come out of the database.
   ========================================================================== */

import { $, $$, esc, el, initTheme, observeReveals } from './ui.js';
import { icon } from './icons.js';
import { section } from './api.js';
import { WEEKDAYS } from './time.js';

const BANNER_DISMISSED = 'fadeco.banner.dismissed';

export function initChrome() {
  initTheme();
  stickyHeader();
  mobileNav();
  observeReveals();
}

function stickyHeader() {
  const header = $('.site-header');
  if (!header) return;
  // Parked in a variable and read once per frame; the scroll handler itself
  // never touches layout.
  let ticking = false;
  const update = () => {
    header.classList.toggle('is-stuck', window.scrollY > 8);
    ticking = false;
  };
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  }, { passive: true });
  update();
}

function mobileNav() {
  const toggle = $('[data-nav-toggle]');
  const nav = $('#mobile-nav');
  if (!toggle || !nav) return;

  toggle.innerHTML = icon('menu', { size: 20 });
  const set = (open) => {
    nav.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.innerHTML = icon(open ? 'x' : 'menu', { size: 20 });
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };

  toggle.addEventListener('click', () => set(nav.hidden));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !nav.hidden) set(false); });
  matchMedia('(min-width: 761px)').addEventListener('change', (e) => { if (e.matches) set(false); });
}

/** The demo-mode notice. Honest about what is and is not persisted. */
export function mountBanner(api) {
  const slot = $('#banner-slot');
  if (!slot || !api.isDemo) return;
  if (sessionStorage.getItem(BANNER_DISMISSED)) return;

  const reason = api.degraded
    ? 'Supabase could not be reached, so the site fell back to demo data.'
    : 'No Supabase project is connected yet.';

  slot.append(el('div', { class: 'banner', role: 'status' },
    el('span', {
      html: `<strong>Demo mode.</strong> ${esc(reason)} Everything works, but data lives in this browser only.`,
    }),
    el('a', { href: 'README.md', text: 'Connect a project' }),
    el('button', {
      class: 'banner-close', type: 'button', 'aria-label': 'Dismiss',
      html: icon('x', { size: 14 }),
      onclick: (e) => {
        sessionStorage.setItem(BANNER_DISMISSED, '1');
        e.target.closest('.banner').remove();
      },
    })));
}

export function fillBrand(content) {
  const business = section(content, 'business', { name: 'Fade & Co', tagline: '', logo_mark: 'F' });
  document.title = document.title.replace('Fade & Co', business.name);
  for (const node of $$('[data-brand-name]')) node.textContent = business.name;
  for (const node of $$('[data-brand-tag]')) node.textContent = business.tagline;
  for (const node of $$('[data-brand-mark]')) {
    node.textContent = business.logo_mark || business.name.trim().charAt(0).toUpperCase();
  }
  return business;
}

const SOCIALS = [
  ['instagram', 'Instagram'],
  ['facebook', 'Facebook'],
  ['tiktok', 'TikTok'],
  ['whatsapp', 'WhatsApp'],
];

export function fillFooter(content) {
  const footer = section(content, 'footer', {});
  const contact = section(content, 'contact', {});
  const social = section(content, 'social', {});

  const set = (sel, value) => { const n = $(sel); if (n) n.textContent = value || ''; };
  set('[data-footer-blurb]', footer.blurb);
  set('[data-footer-note]', footer.note);
  set('[data-footer-legal]', footer.legal);

  const socialWrap = $('[data-social]');
  if (socialWrap) {
    socialWrap.innerHTML = SOCIALS
      .filter(([key]) => social[key])
      .map(([key, label]) => `<a href="${esc(social[key])}" target="_blank" rel="noopener noreferrer"
        aria-label="${label}" title="${label}">${icon(key, { size: 18 })}</a>`)
      .join('');
  }

  const links = $('[data-footer-contact]');
  if (links) {
    const rows = [];
    if (contact.address_line1) {
      rows.push(`<li><span>${esc(contact.address_line1)}</span></li>`);
      if (contact.address_line2) rows.push(`<li><span>${esc(contact.address_line2)}</span></li>`);
    }
    if (contact.phone) rows.push(`<li><a href="tel:${esc(contact.phone.replace(/\s/g, ''))}">${esc(contact.phone)}</a></li>`);
    if (contact.email) rows.push(`<li><a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></li>`);
    links.innerHTML = rows.join('');
  }
}

/* ------------------------------------------------------------------ hours */

/** Groups consecutive weekdays with identical hours: "Mon – Wed  9:00 – 18:00". */
export function hoursRows(schedules, { today = null } = {}) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const byDay = new Map(schedules.map((s) => [s.weekday, s]));
  return order.map((weekday) => {
    const s = byDay.get(weekday);
    return {
      weekday,
      label: WEEKDAYS[weekday],
      isToday: today === weekday,
      closed: !s || s.is_closed,
      opens: s?.opens_at?.slice(0, 5) || '',
      closes: s?.closes_at?.slice(0, 5) || '',
      breakStart: s?.break_start?.slice(0, 5) || '',
      breakEnd: s?.break_end?.slice(0, 5) || '',
    };
  });
}
