/* ==========================================================================
   Confirmation and self-service lookup.

   Arrives from the booking flow with the result in sessionStorage, or from a
   cold link, in which case the reference alone is not enough — the phone
   number on the booking has to match before anything is shown.
   ========================================================================== */

import { getContext, getBackend, section } from './api.js';
import { initChrome, mountBanner, fillBrand, fillFooter } from './chrome.js';
import { icon } from './icons.js';
import { $, esc, el, money, copyText, confirmDialog, toast, toastError, errorMessage } from './ui.js';
import { fmtDate, fmtDuration, fmtTime, toDate } from './time.js';

const RESULT_KEY = 'fadeco.booking.result';

const STATUS = {
  pending: { label: 'Awaiting confirmation', badge: 'badge--warn' },
  confirmed: { label: 'Confirmed', badge: 'badge--ok' },
  completed: { label: 'Completed', badge: 'badge--info' },
  cancelled: { label: 'Cancelled', badge: 'badge--danger' },
  no_show: { label: 'Missed', badge: 'badge--danger' },
};

let ctx = null;
const card = $('#card');

initChrome();
boot().catch((err) => {
  card.innerHTML = `<div class="empty">${icon('alert', { size: 34 })}
    <h4>Something went wrong</h4><p>${esc(errorMessage(err))}</p>
    <a class="btn btn--ghost btn--sm" href="index.html">Back to the site</a></div>`;
});

async function boot() {
  const api = await getBackend();
  mountBanner(api);
  ctx = await getContext();
  fillBrand(ctx.content);
  fillFooter(ctx.content);

  const params = new URLSearchParams(location.search);
  const ref = params.get('ref');

  const fresh = readFresh(ref);
  if (fresh) {
    renderBooking(fresh, { justBooked: true });
    return;
  }

  renderLookup({ reference: ref || '' });
}

function readFresh(ref) {
  try {
    const raw = sessionStorage.getItem(RESULT_KEY);
    if (!raw) return null;
    const result = JSON.parse(raw);
    if (ref && result.reference !== ref) return null;
    return result;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- lookup -- */

function renderLookup({ reference = '', message = '' } = {}) {
  card.innerHTML = `
    <div class="confirm-tick" style="background:var(--accent-soft);color:var(--accent)">
      ${icon('search', { size: 34 })}
    </div>
    <h1 style="font-size:clamp(1.6rem,4vw,2.2rem)">Find your booking</h1>
    <p class="lede" style="margin-top:var(--space-3)">
      Enter the reference from your confirmation and the phone number you booked with.</p>
    ${message ? `<p class="field-error" style="margin-top:var(--space-4)">${esc(message)}</p>` : ''}
    <form id="lookup" class="form-grid" style="margin-top:var(--space-6);text-align:left" novalidate>
      <div class="field">
        <label for="ref">Booking reference</label>
        <input class="input mono" id="ref" name="reference" value="${esc(reference)}"
          placeholder="ABC123" autocomplete="off" style="text-transform:uppercase;letter-spacing:.12em">
      </div>
      <div class="field">
        <label for="phone">Phone number</label>
        <input class="input" id="phone" name="phone" type="tel" autocomplete="tel"
          placeholder="+31 6 1234 5678">
      </div>
      <div class="field--wide">
        <button class="btn btn--primary btn--block" type="submit">Find my booking</button>
      </div>
    </form>
    <p class="summary-note" style="margin-top:var(--space-5)">
      Lost the reference? Call the shop and we will find you by name.</p>`;

  const form = $('#lookup');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const values = Object.fromEntries(new FormData(form).entries());

    if (!values.reference.trim() || !values.phone.trim()) {
      renderLookup({ reference: values.reference, message: 'Both fields are needed.' });
      return;
    }

    button.classList.add('is-busy');
    try {
      const booking = await ctx.api.booking.lookup(values.reference.trim(), values.phone.trim());
      if (!booking) {
        renderLookup({
          reference: values.reference,
          message: 'No booking matches that reference and phone number.',
        });
        return;
      }
      renderBooking({ ...booking, phone: values.phone.trim() });
    } catch (err) {
      button.classList.remove('is-busy');
      toastError(err);
    }
  });

  $('#ref')?.focus();
}

/* --------------------------------------------------------------- booking -- */

function renderBooking(booking, { justBooked = false } = {}) {
  const contact = section(ctx.content, 'contact', {});
  const business = section(ctx.content, 'business', { name: 'Fade & Co' });
  const status = STATUS[booking.status] || STATUS.pending;
  const start = toDate(booking.starts_at);
  const cancellable = ['pending', 'confirmed'].includes(booking.status) && start.getTime() > Date.now();

  card.innerHTML = `
    <div class="confirm-tick">${icon(booking.status === 'cancelled' ? 'xCircle' : 'check', { size: 38 })}</div>
    <h1 style="font-size:clamp(1.7rem,4vw,2.4rem)">
      ${justBooked ? 'You’re booked in.' : booking.status === 'cancelled' ? 'This booking is cancelled.' : 'Here is your booking.'}
    </h1>
    <p class="lede" style="margin-top:var(--space-3)">
      ${justBooked
        ? (booking.status === 'confirmed'
          ? 'Your appointment is confirmed. See you then.'
          : 'We are holding this slot for you. The shop confirms new bookings, usually within the hour.')
        : `Status: ${status.label.toLowerCase()}.`}
    </p>

    <div class="confirm-ref">
      ${esc(booking.reference)}
      <button class="btn btn--icon btn--quiet btn--sm" type="button" data-copy
        aria-label="Copy reference">${icon('note', { size: 15 })}</button>
    </div>

    <p><span class="badge ${status.badge}">${esc(status.label)}</span></p>

    <div class="confirm-details">
      <div><span>When</span><strong>${esc(fmtDate(start, ctx.tz, 'full'))}<br>
        ${esc(fmtTime(start, ctx.tz))}${booking.ends_at ? ` – ${esc(fmtTime(booking.ends_at, ctx.tz))}` : ''}</strong></div>
      <div><span>Service</span><strong>${esc(booking.service || '')}${booking.duration_minutes
        ? `<br><span class="dim" style="font-weight:450">${fmtDuration(booking.duration_minutes)}</span>` : ''}</strong></div>
      <div><span>Barber</span><strong>${esc(booking.barber || '')}</strong></div>
      <div><span>Price</span><strong>${esc(money(booking.price_cents))}<br>
        <span class="dim" style="font-weight:450">Paid in the shop</span></strong></div>
      <div><span>Booked for</span><strong>${esc(booking.customer_name || '')}</strong></div>
      <div><span>Where</span><strong>${esc(business.name)}<br>
        <span class="dim" style="font-weight:450">${esc(contact.address_line1 || '')}, ${esc(contact.address_line2 || '')}</span></strong></div>
    </div>

    <div class="confirm-actions">
      ${booking.status !== 'cancelled' ? `<button class="btn btn--ghost" type="button" data-ics">
        ${icon('calendar', { size: 17 })}Add to calendar</button>` : ''}
      ${contact.phone ? `<a class="btn btn--ghost" href="tel:${esc(contact.phone.replace(/\s/g, ''))}">
        ${icon('phone', { size: 17 })}Call the shop</a>` : ''}
      ${cancellable ? `<button class="btn btn--danger" type="button" data-cancel>
        ${icon('ban', { size: 17 })}Cancel booking</button>` : ''}
      <a class="btn btn--primary" href="book.html">Book another</a>
    </div>

    ${booking.notes ? `<p class="summary-note">Your note: ${esc(booking.notes)}</p>` : ''}
    <p class="summary-note">Keep the reference — you will need it with your phone number to
      look this up again.</p>`;

  card.querySelector('[data-copy]')?.addEventListener('click', () => copyText(booking.reference));
  card.querySelector('[data-ics]')?.addEventListener('click', () => downloadIcs(booking, contact, business));
  card.querySelector('[data-cancel]')?.addEventListener('click', () => cancel(booking));
}

async function cancel(booking) {
  const ok = await confirmDialog({
    title: 'Cancel this appointment?',
    body: `${fmtDate(booking.starts_at, ctx.tz, 'full')} at ${fmtTime(booking.starts_at, ctx.tz)}. `
      + 'The slot goes back to whoever wants it next, so this cannot be undone.',
    confirmLabel: 'Cancel booking',
    cancelLabel: 'Keep it',
    danger: true,
  });
  if (!ok) return;

  try {
    await ctx.api.booking.cancel(booking.reference, booking.phone || booking.customer_phone);
    sessionStorage.removeItem(RESULT_KEY);
    toast('Appointment cancelled', { text: 'Thanks for letting us know.' });
    renderBooking({ ...booking, status: 'cancelled' });
  } catch (err) {
    toastError(err);
  }
}

/* Calendar file, built locally — no third-party calendar service involved. */
function downloadIcs(booking, contact, business) {
  const stamp = (d) => toDate(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const location = [contact.address_line1, contact.address_line2].filter(Boolean).join(', ');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Fade & Co//Booking//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${booking.reference}@fadeandco`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(booking.starts_at)}`,
    `DTEND:${stamp(booking.ends_at || new Date(toDate(booking.starts_at).getTime() + 45 * 60000))}`,
    `SUMMARY:${escapeIcs(`${booking.service} at ${business.name}`)}`,
    `DESCRIPTION:${escapeIcs(`With ${booking.barber}. Reference ${booking.reference}.`)}`,
    location ? `LOCATION:${escapeIcs(location)}` : '',
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcs(`${business.name} in 2 hours`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `booking-${booking.reference}.ics` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeIcs(text) {
  return String(text).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
}
