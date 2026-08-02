/* ==========================================================================
   The public site. Every section is rendered from the database — nothing on
   the page is hard-coded copy the admin cannot change.
   ========================================================================== */

import { getContext, getBackend, section } from './api.js';
import { initChrome, mountBanner, fillBrand, fillFooter, hoursRows } from './chrome.js';
import { icon } from './icons.js';
import {
  $, esc, safeUrl, el, money, initials, observeReveals, stagger, emptyState, toastError,
} from './ui.js';
import {
  fmtDuration, fmtTime, fmtDayLabel, todayIn, weekdayOf, addDays, minutesIn, hmToMinutes,
} from './time.js';

initChrome();

boot().catch((err) => {
  console.error(err);
  toastError(err);
});

async function boot() {
  const api = await getBackend();
  mountBanner(api);

  const { settings, content } = await getContext();
  const tz = settings.timezone;

  fillBrand(content);
  fillFooter(content);
  renderHero(content);
  renderAbout(content);
  renderFaq(content);
  renderContact(content, tz);

  // The remaining sections each own their fetch, so a slow one never blocks
  // the rest of the page from filling in.
  await Promise.all([
    renderServices(api, settings),
    renderBarbers(api),
    renderGallery(api),
    renderReviews(api),
    renderHours(api, tz),
  ]);

  renderNextAvailable(api, settings).catch(() => {});
  observeReveals();
}

/* ------------------------------------------------------------------ hero -- */

function renderHero(content) {
  const hero = section(content, 'hero', {});
  const set = (sel, value) => { const n = $(sel); if (n && value !== undefined) n.textContent = value; };

  set('[data-hero-eyebrow]', hero.eyebrow);
  set('[data-hero-title]', hero.title);
  set('[data-hero-sub]', hero.subtitle);
  if (hero.primary_cta) set('[data-hero-cta]', hero.primary_cta);
  if (hero.secondary_cta) set('[data-hero-cta2]', hero.secondary_cta);

  const stats = [
    [hero.stat_one_value, hero.stat_one_label],
    [hero.stat_two_value, hero.stat_two_label],
    [hero.stat_three_value, hero.stat_three_label],
  ].filter(([value]) => value);

  const wrap = $('[data-hero-stats]');
  if (wrap) {
    wrap.innerHTML = stats
      .map(([value, label]) => `<div><dt>${esc(value)}</dt><dd>${esc(label)}</dd></div>`)
      .join('');
  }
}

/* -------------------------------------------------------------- services -- */

async function renderServices(api, settings) {
  const wrap = $('[data-services]');
  if (!wrap) return;
  wrap.innerHTML = `<div class="skeleton skeleton--card"></div>`.repeat(6);

  try {
    const services = await api.services.list();
    if (!services.length) {
      wrap.innerHTML = emptyState({ iconName: 'scissors', title: 'The menu is being updated' });
      return;
    }

    wrap.innerHTML = services.map((s) => `
      <article class="glass card service-card card--hover reveal">
        ${s.is_featured ? '<span class="badge badge--accent service-flag">Popular</span>' : ''}
        <div class="service-card-top">
          <span class="service-icon">${icon(s.icon || 'scissors', { size: 20 })}</span>
          <div>
            <h3>${esc(s.name)}</h3>
            <span class="chip">${icon('clock')}${fmtDuration(s.duration_minutes)}</span>
          </div>
        </div>
        <p>${esc(s.description)}</p>
        <div class="service-meta">
          <span class="service-price">${esc(money(s.price_cents))}</span>
          <a class="btn btn--ghost btn--sm" href="book.html?service=${encodeURIComponent(s.id)}">
            Book${icon('arrowRight', { size: 15 })}
          </a>
        </div>
      </article>`).join('');

    stagger(wrap);
    observeReveals(wrap);
  } catch (err) {
    wrap.innerHTML = emptyState({ iconName: 'alert', title: 'Could not load the menu', text: err.message });
  }
  void settings;
}

/* --------------------------------------------------------------- barbers -- */

async function renderBarbers(api) {
  const wrap = $('[data-barbers]');
  if (!wrap) return;
  wrap.innerHTML = `<div class="skeleton skeleton--card" style="height:300px"></div>`.repeat(4);

  try {
    const barbers = await api.barbers.list();
    if (!barbers.length) {
      wrap.innerHTML = emptyState({ iconName: 'users', title: 'Barber profiles are on their way' });
      return;
    }

    wrap.innerHTML = barbers.map((b) => `
      <article class="glass card barber-card card--hover reveal">
        ${avatar(b, 88)}
        <h3>${esc(b.name)}</h3>
        <p class="barber-role">${esc(b.title)}</p>
        <p class="barber-bio">${esc(b.bio)}</p>
        <div class="barber-tags">
          ${(b.specialties || []).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}
        </div>
        ${b.on_vacation
          ? `<p class="chip" style="margin-top:var(--space-4)">${icon('palm')}Away${b.vacation_note ? ` — ${esc(b.vacation_note)}` : ''}</p>`
          : `<a class="btn btn--ghost btn--sm btn--block" href="book.html?barber=${encodeURIComponent(b.id)}">
              Book with ${esc(b.name.split(' ')[0])}</a>`}
      </article>`).join('');

    stagger(wrap);
    observeReveals(wrap);
  } catch (err) {
    wrap.innerHTML = emptyState({ iconName: 'alert', title: 'Could not load the team', text: err.message });
  }
}

export function avatar(person, size = 88) {
  const src = safeUrl(person?.photo_url);
  return `<span class="avatar" style="--avatar:${size}px" aria-hidden="true">${
    src ? `<img src="${esc(src)}" alt="" loading="lazy">` : esc(initials(person?.name))
  }</span>`;
}

/* ----------------------------------------------------------------- about -- */

function renderAbout(content) {
  const about = section(content, 'about', {});
  const title = $('[data-about-title]');
  const body = $('[data-about-body]');
  if (title) title.textContent = about.title || '';
  if (body) {
    body.innerHTML = String(about.body || '')
      .split(/\n{2,}/).filter(Boolean)
      .map((p) => `<p>${esc(p)}</p>`).join('');
  }
  const quote = $('[data-about-quote]');
  const author = $('[data-about-quote-author]');
  if (quote) quote.textContent = about.quote || '';
  if (author) author.textContent = about.quote_author || '';
  const fig = quote?.closest('figure');
  if (fig) fig.hidden = !about.quote;
}

/* --------------------------------------------------------------- gallery -- */

async function renderGallery(api) {
  const wrap = $('[data-gallery]');
  if (!wrap) return;
  wrap.innerHTML = `<div class="skeleton" style="aspect-ratio:4/5;border-radius:var(--radius-lg)"></div>`.repeat(4);

  try {
    const items = await api.gallery.list();
    if (!items.length) {
      wrap.innerHTML = emptyState({ iconName: 'image', title: 'Photos coming soon' });
      return;
    }

    wrap.innerHTML = items.map((g, i) => `
      <figure class="gallery-item" data-index="${i}" tabindex="0" role="button"
              aria-label="Open image: ${esc(g.alt_text || g.caption || 'gallery image')}">
        <img src="${esc(safeUrl(g.image_url))}" alt="${esc(g.alt_text || g.caption)}"
             loading="lazy" decoding="async">
        ${g.caption ? `<figcaption>${esc(g.caption)}</figcaption>` : ''}
      </figure>`).join('');

    const open = (index) => lightbox(items, index);
    wrap.addEventListener('click', (e) => {
      const fig = e.target.closest('[data-index]');
      if (fig) open(Number(fig.dataset.index));
    });
    wrap.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const fig = e.target.closest('[data-index]');
      if (!fig) return;
      e.preventDefault();
      open(Number(fig.dataset.index));
    });
  } catch (err) {
    wrap.innerHTML = emptyState({ iconName: 'alert', title: 'Could not load the gallery', text: err.message });
  }
}

function lightbox(items, startIndex) {
  let index = startIndex;
  const img = el('img', { src: safeUrl(items[index].image_url), alt: items[index].alt_text || '' });
  const caption = el('p', { class: 'muted', style: 'margin-top:12px', text: items[index].caption || '' });

  const show = (next) => {
    index = (next + items.length) % items.length;
    img.src = safeUrl(items[index].image_url);
    img.alt = items[index].alt_text || '';
    caption.textContent = items[index].caption || '';
  };

  const dlg = el('dialog', { class: 'modal lightbox' },
    el('div', { class: 'modal-body', style: 'padding:16px;text-align:center' }, img, caption),
    el('div', { class: 'modal-foot' },
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button',
        html: `${icon('chevronLeft', { size: 16 })}Previous`, onclick: () => show(index - 1) }),
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button',
        html: `Next${icon('chevronRight', { size: 16 })}`, onclick: () => show(index + 1) }),
      el('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Close',
        onclick: () => dlg.close() })));

  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  dlg.showModal();
}

/* --------------------------------------------------------------- reviews -- */

async function renderReviews(api) {
  const wrap = $('[data-reviews]');
  if (!wrap) return;
  wrap.innerHTML = `<div class="skeleton skeleton--card"></div>`.repeat(3);

  try {
    const reviews = await api.reviews.list();
    const host = wrap.closest('.section');
    if (!reviews.length) {
      if (host) host.hidden = true;
      return;
    }

    wrap.innerHTML = reviews.map((r) => `
      <article class="glass card review-card reveal">
        <div class="stars" aria-label="${r.rating} out of 5">
          ${icon('star').repeat(Math.max(1, Math.min(5, r.rating)))}
        </div>
        <p class="review-body">${esc(r.body)}</p>
        <div class="review-author">
          ${avatar({ name: r.author_name }, 38)}
          <div><strong>${esc(r.author_name)}</strong><span>${esc(r.author_role)}</span></div>
        </div>
      </article>`).join('');

    stagger(wrap);
    observeReveals(wrap);
  } catch {
    wrap.closest('.section')?.setAttribute('hidden', '');
  }
}

/* ------------------------------------------------------------------- faq -- */

function renderFaq(content) {
  const wrap = $('[data-faq]');
  if (!wrap) return;
  const items = section(content, 'faq', { items: [] }).items || [];
  if (!items.length) {
    wrap.closest('.section')?.setAttribute('hidden', '');
    return;
  }

  wrap.innerHTML = items.map((item, i) => `
    <details class="faq-item reveal" ${i === 0 ? 'open' : ''}>
      <summary>${esc(item.q)}${icon('chevronDown', { size: 18 })}</summary>
      <p class="faq-answer">${esc(item.a)}</p>
    </details>`).join('');

  stagger(wrap, 40);
  observeReveals(wrap);
}

/* --------------------------------------------------------------- contact -- */

function renderContact(content, tz) {
  const contact = section(content, 'contact', {});
  const title = $('[data-contact-title]');
  const sub = $('[data-contact-sub]');
  if (title) title.textContent = contact.title || 'Find us';
  if (sub) sub.textContent = contact.subtitle || '';

  const details = $('[data-contact-details]');
  if (details) {
    const rows = [];
    if (contact.address_line1) {
      rows.push(row('pin', 'Address',
        `${esc(contact.address_line1)}<br>${esc(contact.address_line2 || '')}`,
        mapsHref(contact)));
    }
    if (contact.phone) {
      rows.push(row('phone', 'Phone', esc(contact.phone), `tel:${contact.phone.replace(/\s/g, '')}`));
    }
    if (contact.email) {
      rows.push(row('mail', 'Email', esc(contact.email), `mailto:${contact.email}`));
    }
    details.innerHTML = `<ul class="contact-list">${rows.join('')}</ul>
      ${contact.directions_note ? `<p class="muted" style="margin-top:var(--space-5);font-size:.9rem">
        ${esc(contact.directions_note)}</p>` : ''}`;
  }

  const map = $('[data-map]');
  if (map) map.innerHTML = mapEmbed(contact);
  void tz;
}

function row(iconName, label, value, href) {
  const inner = `<div><strong>${label}</strong>${href
    ? `<a href="${esc(href)}"${href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${value}</a>`
    : value}</div>`;
  return `<li><span class="service-icon">${icon(iconName, { size: 18 })}</span>${inner}</li>`;
}

function mapsHref(contact) {
  const q = contact.map_query || [contact.address_line1, contact.address_line2].filter(Boolean).join(', ');
  return q ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(q)}` : '';
}

/**
 * OpenStreetMap's embed needs no key and no tracking script. The address sits
 * *behind* the iframe rather than instead of it, so a blocked or failing map —
 * offline, a strict content blocker, no coordinates set — leaves the useful
 * information on screen instead of an empty rectangle.
 */
function mapEmbed(contact) {
  const fallback = `<div class="contact-map-fallback">${icon('pin', { size: 30 })}
    <div><strong>${esc(contact.address_line1 || '')}</strong><br>
    <span class="muted">${esc(contact.address_line2 || '')}</span></div>
    ${mapsHref(contact) ? `<a class="btn btn--ghost btn--sm" target="_blank" rel="noopener noreferrer"
      href="${esc(mapsHref(contact))}">Open in maps${icon('external', { size: 15 })}</a>` : ''}</div>`;

  const lat = Number(contact.map_lat);
  const lng = Number(contact.map_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return fallback;

  const d = 0.004;
  const bbox = [lng - d, lat - d / 2, lng + d, lat + d / 2].join('%2C');
  return `${fallback}<iframe title="Map to the shop" loading="lazy" referrerpolicy="no-referrer"
    src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}"></iframe>`;
}

/* ----------------------------------------------------------------- hours -- */

async function renderHours(api, tz) {
  const wrap = $('[data-hours]');
  const strip = $('[data-open-now]');
  if (!wrap && !strip) return;

  try {
    const schedules = await api.schedules.list(null);
    const todayDow = weekdayOf(todayIn(tz));
    const rows = hoursRows(schedules, { today: todayDow });

    if (wrap) {
      wrap.innerHTML = `<h3 style="font-size:1rem;margin-bottom:var(--space-4)">Opening hours</h3>
        <table class="hours-table"><tbody>${rows.map((r) => `
          <tr${r.isToday ? ' data-today' : ''}>
            <th scope="row">${r.label}</th>
            <td>${r.closed ? '<span class="hours-shut">Closed</span>'
              : `${r.opens} – ${r.closes}${r.breakStart ? `<br><span class="dim" style="font-size:.8rem">break ${r.breakStart}–${r.breakEnd}</span>` : ''}`}</td>
          </tr>`).join('')}</tbody></table>`;
    }

    if (strip) {
      const today = rows.find((r) => r.isToday);
      const status = openStatus(today, tz);
      strip.innerHTML = `<span class="dot${status.open ? '' : ' dot--shut'}"></span>
        <strong>${esc(status.headline)}</strong>
        <span class="muted">${esc(status.detail)}</span>
        <span class="hero-hours-sep"></span>
        <a class="btn btn--ghost btn--sm" href="#contact">Opening hours${icon('arrowRight', { size: 15 })}</a>`;
    }
  } catch {
    strip?.remove();
    if (wrap) wrap.hidden = true;
  }
}

function openStatus(today, tz) {
  if (!today || today.closed) {
    return { open: false, headline: 'Closed today', detail: 'Booking online is open around the clock.' };
  }
  const now = minutesIn(new Date(), tz);
  const opens = hmToMinutes(today.opens);
  const closes = hmToMinutes(today.closes);
  if (now < opens) {
    return { open: false, headline: `Opens at ${today.opens}`, detail: `Today until ${today.closes}.` };
  }
  if (now >= closes) {
    return { open: false, headline: 'Closed for today', detail: 'Book online for tomorrow.' };
  }
  return { open: true, headline: 'Open now', detail: `Until ${today.closes} today.` };
}

/* -------------------------------------------------------- next available -- */

/** The hero's live availability card: the first day with room, and the first
 *  three times on it, deep-linked into the booking flow. */
async function renderNextAvailable(api, settings) {
  const body = $('[data-next-slots]');
  const dayChip = $('[data-next-day]');
  if (!body) return;

  const services = await api.services.list();
  const service = services.find((s) => s.is_featured) || services[0];
  if (!service) {
    body.innerHTML = `<p class="hero-card-note">Booking opens as soon as the menu is published.</p>`;
    return;
  }

  const today = todayIn(settings.timezone);
  const days = await api.booking.days({
    barberId: null, serviceId: service.id, from: today, count: 14,
  });
  const firstOpen = Object.keys(days).sort().find((d) => days[d]);

  if (!firstOpen) {
    body.innerHTML = `<p class="hero-card-note">Fully booked for the next two weeks.
      Call us and we will find you a chair.</p>`;
    if (dayChip) dayChip.textContent = 'Busy';
    return;
  }

  const byBarber = await api.booking.slotsAll({ serviceId: service.id, date: firstOpen });
  const times = [...new Set(Object.values(byBarber).flat().map((s) => s.slot_start))]
    .sort().slice(0, 6);

  if (dayChip) dayChip.textContent = fmtDayLabel(firstOpen, settings.timezone);

  body.innerHTML = `
    <p class="hero-card-note">${esc(service.name)} · ${fmtDuration(service.duration_minutes)}
      · ${esc(money(service.price_cents))}</p>
    <div class="slot-row">
      ${times.slice(0, 6).map((t) => `
        <a class="slot-pill" href="book.html?service=${encodeURIComponent(service.id)}&date=${firstOpen}&time=${encodeURIComponent(t)}">
          ${esc(fmtTime(t, settings.timezone))}</a>`).join('')}
    </div>`;
  void addDays;
}
