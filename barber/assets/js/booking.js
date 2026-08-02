/* ==========================================================================
   The booking flow.

   Six steps, one state object, one render function. The client never decides
   what is bookable: every time shown came from the availability RPC, and the
   final write re-checks it server-side, so a slot taken while someone was
   filling in their name fails loudly rather than double-booking a chair.
   ========================================================================== */

import { getContext, getBackend, section } from './api.js';
import { initChrome, mountBanner, fillBrand, fillFooter } from './chrome.js';
import { icon } from './icons.js';
import { $, esc, el, money, initials, safeUrl, toast, toastError, errorMessage } from './ui.js';
import {
  addDays, daysBetween, endOfMonth, fmtDate, fmtDayLabel, fmtDuration, fmtTime,
  startOfMonth, todayIn, weekdayOf, WEEKDAYS_SHORT, minutesIn,
} from './time.js';

const STEPS = [
  { key: 'service', label: 'Service' },
  { key: 'barber', label: 'Barber' },
  { key: 'date', label: 'Date' },
  { key: 'time', label: 'Time' },
  { key: 'details', label: 'Your details' },
  { key: 'confirm', label: 'Confirm' },
];

const DETAILS_KEY = 'fadeco.customer';
const RESULT_KEY = 'fadeco.booking.result';

const state = {
  step: 0,
  services: [],
  barbers: [],
  service: null,
  barber: null,        // null means "first available"
  date: null,
  slot: null,          // { slot_start, barbers: [ids] }
  chosenBarberId: null,
  month: null,
  dayAvailability: {},
  slots: [],
  slotsByBarber: {},
  details: { name: '', phone: '', email: '', notes: '' },
  loading: false,
  submitting: false,
};

let ctx = null;

initChrome();
boot().catch((err) => {
  console.error(err);
  $('#panel').innerHTML = `<div class="empty">${icon('alert', { size: 34 })}
    <h4>The booking system is not responding</h4>
    <p>${esc(errorMessage(err))}</p>
    <a class="btn btn--ghost btn--sm" href="index.html">Back to the site</a></div>`;
});

async function boot() {
  const api = await getBackend();
  mountBanner(api);
  ctx = await getContext();
  fillBrand(ctx.content);
  fillFooter(ctx.content);

  const [services, barbers] = await Promise.all([
    ctx.api.services.list(),
    ctx.api.barbers.list(),
  ]);
  state.services = services;
  state.barbers = barbers.filter((b) => !b.on_vacation);

  restoreDetails();
  applyDeepLink();
  render();
}

/* ------------------------------------------------------------ deep links -- */

function applyDeepLink() {
  const params = new URLSearchParams(location.search);
  const service = state.services.find((s) => s.id === params.get('service'));
  const barber = state.barbers.find((b) => b.id === params.get('barber'));

  if (service) { state.service = service; state.step = 1; }
  if (barber) { state.barber = barber; if (state.service) state.step = 2; }

  const date = params.get('date');
  if (state.service && date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    state.date = date;
    state.step = 3;
    const time = params.get('time');
    if (time && !Number.isNaN(Date.parse(time))) {
      // Held until the slot list confirms it is really free.
      state.pendingTime = new Date(time).toISOString();
    }
  }
  state.month = startOfMonth(state.date || todayIn(ctx.tz));
}

function syncUrl() {
  const params = new URLSearchParams();
  if (state.service) params.set('service', state.service.id);
  if (state.barber) params.set('barber', state.barber.id);
  if (state.date) params.set('date', state.date);
  const qs = params.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function restoreDetails() {
  try {
    Object.assign(state.details, JSON.parse(localStorage.getItem(DETAILS_KEY) || '{}'));
  } catch { /* ignore */ }
}

/* ---------------------------------------------------------------- render -- */

function render() {
  renderSteps();
  renderSummary();
  const panel = $('#panel');
  panel.innerHTML = '';
  panel.append(({
    0: stepService,
    1: stepBarber,
    2: stepDate,
    3: stepTime,
    4: stepDetails,
    5: stepConfirm,
  })[state.step]());
  syncUrl();
  panel.querySelector('input, button:not([disabled])')?.focus?.({ preventScroll: true });
}

function renderSteps() {
  const nav = $('#steps');
  nav.innerHTML = STEPS.map((s, i) => {
    const stateName = i === state.step ? 'current' : i < state.step ? 'done' : 'todo';
    const reachable = i < state.step;
    return `${i ? '<span class="step-sep"></span>' : ''}
      <button class="step" type="button" data-state="${stateName}" data-goto="${i}"
        ${reachable ? '' : 'disabled aria-disabled="true"'}>
        <span class="step-num">${i < state.step ? icon('check', { size: 13 }) : i + 1}</span>
        ${esc(s.label)}
      </button>`;
  }).join('');

  nav.onclick = (e) => {
    const btn = e.target.closest('[data-goto]');
    if (!btn || btn.disabled) return;
    goTo(Number(btn.dataset.goto));
  };
}

function goTo(step) {
  state.step = Math.max(0, Math.min(STEPS.length - 1, step));
  render();
  if (step > 0) $('#panel').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function panelHead(title, sub) {
  return el('header', {}, el('h2', { text: title }), sub ? el('p', { text: sub }) : null);
}

function foot({ back = true, next = null, nextLabel = 'Continue', nextDisabled = false } = {}) {
  return el('div', { class: 'booking-foot' },
    back
      ? el('button', {
        class: 'btn btn--quiet', type: 'button',
        html: `${icon('arrowLeft', { size: 16 })}Back`,
        onclick: () => goTo(state.step - 1),
      })
      : el('span'),
    next
      ? el('button', {
        class: 'btn btn--primary', type: 'button', id: 'next-btn',
        html: `${esc(nextLabel)}${icon('arrowRight', { size: 16 })}`,
        ...(nextDisabled ? { disabled: true } : {}),
        onclick: next,
      })
      : null);
}

/* ------------------------------------------------------------ 1. service -- */

function stepService() {
  const wrap = el('div', { class: 'booking-step' },
    panelHead('What are you booking?', 'Prices and lengths are exactly what you get at the counter.'));

  if (!state.services.length) {
    wrap.append(el('div', { class: 'empty', html: `${icon('scissors', { size: 34 })}
      <h4>No services are published</h4><p>Please call the shop to book.</p>` }));
    return wrap;
  }

  const list = el('div', { class: 'choice-grid' });
  for (const s of state.services) {
    list.append(el('button', {
      class: 'choice', type: 'button',
      'aria-pressed': String(state.service?.id === s.id),
      onclick: () => {
        const changed = state.service?.id !== s.id;
        state.service = s;
        if (changed) { state.slot = null; state.slots = []; }
        goTo(1);
      },
      html: `<span class="service-icon">${icon(s.icon || 'scissors', { size: 20 })}</span>
        <span class="choice-main">
          <strong>${esc(s.name)}</strong>
          <span>${esc(s.description)}</span>
        </span>
        <span class="choice-side">
          <b>${esc(money(s.price_cents))}</b>
          <small>${fmtDuration(s.duration_minutes)}</small>
        </span>`,
    }));
  }

  wrap.append(list);
  return wrap;
}

/* ------------------------------------------------------------- 2. barber -- */

function stepBarber() {
  const wrap = el('div', { class: 'booking-step' },
    panelHead('Who would you like?', 'Pick a barber, or let us give you the earliest chair.'));

  const list = el('div', { class: 'choice-grid' });

  list.append(el('button', {
    class: 'choice', type: 'button',
    'aria-pressed': String(state.barber === null),
    onclick: () => { state.barber = null; state.slot = null; goTo(2); },
    html: `<span class="service-icon">${icon('sparkle', { size: 20 })}</span>
      <span class="choice-main"><strong>First available</strong>
        <span>The soonest appointment with any of our barbers.</span></span>
      ${icon('chevronRight', { size: 18 })}`,
  }));

  for (const b of state.barbers) {
    const photo = safeUrl(b.photo_url);
    list.append(el('button', {
      class: 'choice', type: 'button',
      'aria-pressed': String(state.barber?.id === b.id),
      onclick: () => { state.barber = b; state.slot = null; goTo(2); },
      html: `<span class="avatar">${photo
        ? `<img src="${esc(photo)}" alt="">` : esc(initials(b.name))}</span>
        <span class="choice-main"><strong>${esc(b.name)}</strong>
          <span>${esc(b.title || (b.specialties || []).join(' · '))}</span></span>
        ${icon('chevronRight', { size: 18 })}`,
    }));
  }

  wrap.append(list, foot({ back: true }));
  return wrap;
}

/* --------------------------------------------------------------- 3. date -- */

function stepDate() {
  const wrap = el('div', { class: 'booking-step' },
    panelHead('Pick a day', state.barber
      ? `Days ${state.barber.name} has room for a ${state.service.name.toLowerCase()}.`
      : 'Greyed-out days are fully booked or closed.'));

  const cal = el('div', { class: 'cal' });
  wrap.append(cal, foot({ back: true }));
  drawCalendar(cal);
  loadMonth(cal);
  return wrap;
}

async function loadMonth(cal) {
  const today = todayIn(ctx.tz);
  const from = state.month < startOfMonth(today) ? startOfMonth(today) : state.month;
  const start = from === startOfMonth(today) && state.month === startOfMonth(today) ? today : from;
  const last = endOfMonth(state.month);
  const count = Math.max(1, daysBetween(start, last) + 1);

  state.loading = true;
  drawCalendar(cal);
  try {
    state.dayAvailability = await ctx.api.booking.days({
      barberId: state.barber?.id || null,
      serviceId: state.service.id,
      from: start,
      count: Math.min(count, 62),
    });
  } catch (err) {
    toastError(err);
    state.dayAvailability = {};
  } finally {
    state.loading = false;
    drawCalendar(cal);
  }
}

function drawCalendar(cal) {
  const today = todayIn(ctx.tz);
  const first = state.month;
  const last = endOfMonth(state.month);
  const lead = (weekdayOf(first) + 6) % 7; // weeks start Monday
  const maxDate = addDays(today, ctx.settings.max_advance_days);

  const days = [];
  for (let i = 0; i < lead; i += 1) days.push('<div class="cal-empty"></div>');

  for (let d = first; d <= last; d = addDays(d, 1)) {
    const num = Number(d.slice(8));
    const past = daysBetween(today, d) < 0;
    const beyond = d > maxDate;
    const known = Object.prototype.hasOwnProperty.call(state.dayAvailability, d);
    const free = state.dayAvailability[d];
    const disabled = past || beyond || (known && !free) || (state.loading && !known);
    days.push(`<button class="cal-day" type="button" data-date="${d}"
      ${d === today ? 'data-today' : ''}
      aria-pressed="${state.date === d}"
      aria-label="${esc(fmtDate(new Date(`${d}T12:00:00Z`), 'UTC', 'full'))}"
      ${disabled ? 'disabled' : ''}>${num}</button>`);
  }

  const canGoBack = state.month > startOfMonth(today);
  const canGoNext = state.month < startOfMonth(maxDate);

  cal.innerHTML = `
    <div class="cal-head">
      <button class="btn btn--icon btn--ghost btn--sm" type="button" data-month="-1"
        aria-label="Previous month" ${canGoBack ? '' : 'disabled'}>${icon('chevronLeft', { size: 16 })}</button>
      <h3>${esc(new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(`${state.month}T12:00:00Z`)))}</h3>
      <button class="btn btn--icon btn--ghost btn--sm" type="button" data-month="1"
        aria-label="Next month" ${canGoNext ? '' : 'disabled'}>${icon('chevronRight', { size: 16 })}</button>
    </div>
    <div class="cal-grid">
      ${[1, 2, 3, 4, 5, 6, 0].map((d) => `<div class="cal-dow">${WEEKDAYS_SHORT[d].slice(0, 2)}</div>`).join('')}
      ${days.join('')}
    </div>
    ${state.loading ? '<p class="dim" style="font-size:.85rem">Checking availability…</p>' : ''}`;

  cal.onclick = (e) => {
    const month = e.target.closest('[data-month]');
    if (month) {
      state.month = month.dataset.month === '1'
        ? addDays(endOfMonth(state.month), 1)
        : startOfMonth(addDays(state.month, -1));
      loadMonth(cal);
      return;
    }
    const day = e.target.closest('[data-date]');
    if (day && !day.disabled) {
      state.date = day.dataset.date;
      state.slot = null;
      goTo(3);
    }
  };
}

/* --------------------------------------------------------------- 4. time -- */

function stepTime() {
  const wrap = el('div', { class: 'booking-step' },
    panelHead(fmtDayLabel(state.date, ctx.tz),
      `${fmtDate(new Date(`${state.date}T12:00:00Z`), 'UTC', 'full')} · ${state.service.name}`));

  const body = el('div', { class: 'slot-groups' },
    el('div', { class: 'skeleton skeleton--pill' }),
    el('div', { class: 'skeleton skeleton--pill' }));

  wrap.append(body, foot({ back: true }));
  loadSlots(body);
  return wrap;
}

async function loadSlots(body) {
  try {
    if (state.barber) {
      const slots = await ctx.api.booking.slots({
        barberId: state.barber.id, serviceId: state.service.id, date: state.date,
      });
      state.slotsByBarber = { [state.barber.id]: slots };
    } else {
      state.slotsByBarber = await ctx.api.booking.slotsAll({
        serviceId: state.service.id, date: state.date,
      });
    }
  } catch (err) {
    body.innerHTML = `<div class="empty">${icon('alert', { size: 34 })}
      <h4>Could not load times</h4><p>${esc(errorMessage(err))}</p></div>`;
    return;
  }

  // Collapse every barber's slots into one list of distinct times, remembering
  // which barbers can take each one.
  const byTime = new Map();
  for (const [barberId, slots] of Object.entries(state.slotsByBarber)) {
    for (const s of slots) {
      const key = new Date(s.slot_start).toISOString();
      if (!byTime.has(key)) byTime.set(key, []);
      byTime.get(key).push(barberId);
    }
  }
  state.slots = [...byTime.entries()]
    .map(([slot_start, barbers]) => ({ slot_start, barbers }))
    .sort((a, b) => a.slot_start.localeCompare(b.slot_start));

  if (!state.slots.length) {
    body.innerHTML = `<div class="empty">${icon('calendar', { size: 34 })}
      <h4>Nothing free on this day</h4>
      <p>Every chair is taken. Try the next open day.</p>
      <button class="btn btn--ghost btn--sm" type="button" data-back-to-date>Pick another day</button></div>`;
    body.querySelector('[data-back-to-date]').onclick = () => goTo(2);
    return;
  }

  // Auto-select a deep-linked time if it survived to here.
  if (state.pendingTime) {
    const match = state.slots.find((s) => s.slot_start === state.pendingTime);
    state.pendingTime = null;
    if (match) { chooseSlot(match); return; }
    toast('That time has gone', { text: 'Here is what is still free that day.', type: 'info' });
  }

  const groups = [
    ['Morning', (m) => m < 12 * 60],
    ['Afternoon', (m) => m >= 12 * 60 && m < 17 * 60],
    ['Evening', (m) => m >= 17 * 60],
  ];

  body.innerHTML = groups.map(([label, test]) => {
    const rows = state.slots.filter((s) => test(minutesIn(new Date(s.slot_start), ctx.tz)));
    if (!rows.length) return '';
    return `<div class="slot-group">
      <h4>${label}</h4>
      <div class="slot-grid">
        ${rows.map((s) => `<button class="slot" type="button" data-slot="${esc(s.slot_start)}"
          aria-pressed="${state.slot?.slot_start === s.slot_start}">
          ${esc(fmtTime(s.slot_start, ctx.tz))}</button>`).join('')}
      </div></div>`;
  }).join('');

  body.onclick = (e) => {
    const btn = e.target.closest('[data-slot]');
    if (!btn) return;
    chooseSlot(state.slots.find((s) => s.slot_start === btn.dataset.slot));
  };
}

function chooseSlot(slot) {
  state.slot = slot;
  // "First available" resolves to a real barber at the moment of choosing, so
  // the summary and the confirmation name the person you will actually see.
  state.chosenBarberId = state.barber?.id || slot.barbers[0];
  goTo(4);
}

/* ------------------------------------------------------------ 5. details -- */

function stepDetails() {
  const wrap = el('div', { class: 'booking-step' },
    panelHead('Who is the chair for?', 'We only use this to hold the appointment and to reach you if something changes.'));

  const d = state.details;
  const form = el('form', { class: 'form-grid', novalidate: true, id: 'details-form' },
    field('name', 'Full name', 'text', d.name, { required: true, autocomplete: 'name', placeholder: 'Alex Meijer' }),
    field('phone', 'Phone', 'tel', d.phone, { required: true, autocomplete: 'tel', placeholder: '+31 6 1234 5678' }),
    field('email', 'Email', 'email', d.email, { autocomplete: 'email', placeholder: 'you@example.com', hint: 'Optional. We send the confirmation here if you give it.', wide: true }),
    field('notes', 'Anything we should know?', 'textarea', d.notes, { placeholder: 'Booking for my son, he is 9. Scissors only on top.', wide: true }));

  wrap.append(form, foot({
    back: true,
    nextLabel: 'Review booking',
    next: () => {
      const values = Object.fromEntries(new FormData(form).entries());
      if (!checkDetails(form, values)) return;
      state.details = {
        name: values.name.trim(),
        phone: values.phone.trim(),
        email: values.email.trim(),
        notes: values.notes.trim(),
      };
      try { localStorage.setItem(DETAILS_KEY, JSON.stringify(state.details)); } catch { /* private mode */ }
      goTo(5);
    },
  }));
  return wrap;
}

function field(name, label, type, value, opts = {}) {
  const id = `bf-${name}`;
  const control = type === 'textarea'
    ? `<textarea class="textarea" id="${id}" name="${name}" rows="3"
        placeholder="${esc(opts.placeholder || '')}">${esc(value || '')}</textarea>`
    : `<input class="input" id="${id}" name="${name}" type="${type}" value="${esc(value || '')}"
        placeholder="${esc(opts.placeholder || '')}"
        ${opts.autocomplete ? `autocomplete="${opts.autocomplete}"` : ''}
        ${opts.required ? 'required' : ''}>`;

  return el('div', {
    class: `field ${opts.wide ? 'field--wide' : ''}`,
    html: `<label for="${id}">${esc(label)}${opts.required ? '' : ' <span class="dim">(optional)</span>'}</label>
      ${control}
      ${opts.hint ? `<p class="field-hint">${esc(opts.hint)}</p>` : ''}
      <p class="field-error" hidden data-error-for="${name}"></p>`,
  });
}

function checkDetails(form, values) {
  const problems = {
    name: values.name.trim().length < 2 ? 'Please enter your full name.' : '',
    phone: values.phone.replace(/\D/g, '').length < 7 ? 'Please enter a phone number we can reach you on.' : '',
    email: values.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email.trim())
      ? 'That email does not look right.' : '',
  };
  let first = null;
  for (const [name, msg] of Object.entries(problems)) {
    const slot = form.querySelector(`[data-error-for="${name}"]`);
    slot.textContent = msg;
    slot.hidden = !msg;
    form.elements[name].setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg && !first) first = form.elements[name];
  }
  first?.focus();
  return !first;
}

/* ------------------------------------------------------------ 6. confirm -- */

function stepConfirm() {
  const barber = state.barbers.find((b) => b.id === state.chosenBarberId);
  const contact = section(ctx.content, 'contact', {});

  const wrap = el('div', { class: 'booking-step' },
    panelHead('One last look', 'Nothing is charged online. You pay in the shop.'));

  wrap.append(el('div', { class: 'choice-grid' },
    reviewRow('scissors', state.service.name,
      `${fmtDuration(state.service.duration_minutes)} · ${money(state.service.price_cents)}`, 0),
    reviewRow('user', barber?.name || 'First available', barber?.title || '', 1),
    reviewRow('calendar', fmtDate(state.slot.slot_start, ctx.tz, 'full'),
      `${fmtTime(state.slot.slot_start, ctx.tz)} · ${esc(contact.address_line1 || '')}`, 2),
    reviewRow('phone', state.details.name,
      [state.details.phone, state.details.email].filter(Boolean).join(' · '), 4)));

  if (state.details.notes) {
    wrap.append(el('p', {
      class: 'summary-note',
      style: 'margin-top:var(--space-4)',
      text: `Note for the barber: ${state.details.notes}`,
    }));
  }

  wrap.append(el('p', {
    class: 'summary-note',
    text: ctx.settings.auto_confirm
      ? 'Your appointment is confirmed the moment you book.'
      : 'The shop confirms new bookings, usually within the hour. You will keep this slot in the meantime.',
  }));

  wrap.append(foot({
    back: true,
    nextLabel: 'Confirm booking',
    next: (e) => submit(e.currentTarget),
  }));
  return wrap;
}

function reviewRow(iconName, title, sub, step) {
  return el('div', {
    class: 'choice',
    style: 'cursor:default',
    html: `<span class="service-icon">${icon(iconName, { size: 20 })}</span>
      <span class="choice-main"><strong>${esc(title)}</strong><span>${esc(sub)}</span></span>`,
  }, el('button', {
    class: 'btn btn--quiet btn--sm', type: 'button', text: 'Change',
    onclick: () => goTo(step),
  }));
}

async function submit(button) {
  if (state.submitting) return;
  state.submitting = true;
  button.classList.add('is-busy');

  try {
    const result = await ctx.api.booking.create({
      serviceId: state.service.id,
      barberId: state.chosenBarberId,
      startsAt: state.slot.slot_start,
      name: state.details.name,
      phone: state.details.phone,
      email: state.details.email || null,
      notes: state.details.notes,
    });

    // Handed to the confirmation page in sessionStorage rather than the URL:
    // a booking reference and a phone number do not belong in a link that
    // gets pasted into chat windows.
    sessionStorage.setItem(RESULT_KEY, JSON.stringify({
      ...result, phone: state.details.phone, email: state.details.email,
    }));
    location.href = `booking.html?ref=${encodeURIComponent(result.reference)}`;
  } catch (err) {
    state.submitting = false;
    button.classList.remove('is-busy');
    toastError(err);

    // A lost race sends the customer back to a freshly loaded slot list
    // rather than letting them hammer a button that cannot work.
    if (/just been taken|no longer available|overlap/i.test(errorMessage(err))) {
      state.slot = null;
      goTo(3);
    }
  }
}

/* -------------------------------------------------------------- summary -- */

function renderSummary() {
  const box = $('#summary');
  const barber = state.barbers.find((b) => b.id === state.chosenBarberId);

  // "First available" is only meaningful once step 2 has actually been
  // answered; before that the row would be asserting a choice nobody made.
  const barberLabel = state.barber ? state.barber.name
    : state.step > 1 ? (barber?.name || 'First available')
      : null;

  const rows = [
    ['Service', state.service?.name],
    ['Barber', barberLabel],
    ['Date', state.date ? fmtDate(new Date(`${state.date}T12:00:00Z`), 'UTC', 'long') : null],
    ['Time', state.slot ? fmtTime(state.slot.slot_start, ctx?.tz) : null],
    ['Length', state.service ? fmtDuration(state.service.duration_minutes) : null],
  ].filter(([, v]) => v);

  box.innerHTML = `
    <h3>Your booking</h3>
    ${rows.length
      ? `<dl class="summary-list">${rows.map(([k, v]) => `
          <div class="summary-row"><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`
      : '<p class="muted" style="font-size:.9rem">Choose a service to begin.</p>'}
    ${state.service ? `<div class="summary-total">
      <span class="muted">Total</span><b>${esc(money(state.service.price_cents))}</b></div>` : ''}
    <p class="summary-note">${state.service
      ? 'Pay in the shop — card, cash or contactless. No deposit.'
      : 'Six short steps, about a minute.'}</p>`;
}
