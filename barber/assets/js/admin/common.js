/* ==========================================================================
   Shared admin pieces: panels, stat cards, status badges, row menus, the
   little charts, and the one appointment editor every screen reuses.
   ========================================================================== */

import { icon } from '../icons.js';
import { $$, el, esc, money, initials, safeUrl, formDialog, confirmDialog, toast, toastError } from '../ui.js';
import { fmtTime, fmtDate, minutesToHm, minutesIn, ymdIn, zonedToInstant, fmtDuration } from '../time.js';

export const STATUS = {
  pending: { label: 'Pending', badge: 'badge--warn' },
  confirmed: { label: 'Confirmed', badge: 'badge--ok' },
  completed: { label: 'Completed', badge: 'badge--info' },
  cancelled: { label: 'Cancelled', badge: 'badge--danger' },
  no_show: { label: 'No-show', badge: 'badge--danger' },
};

export const STATUS_OPTIONS = Object.entries(STATUS)
  .map(([value, { label }]) => ({ value, label }));

export function statusBadge(status) {
  const s = STATUS[status] || STATUS.pending;
  return `<span class="badge ${s.badge}">${s.label}</span>`;
}

/* ---------------------------------------------------------------- panels -- */

export function panel({ title = '', subtitle = '', actions = null, body = null, flush = false, id = '' } = {}) {
  const head = (title || actions)
    ? el('div', { class: 'panel-head' },
      title ? el('h2', { text: title }) : null,
      actions,
      subtitle ? el('p', { text: subtitle }) : null)
    : null;

  return el('section', { class: 'glass panel', ...(id ? { id } : {}) },
    head,
    el('div', { class: `panel-body ${flush ? 'panel-body--flush' : ''}` },
      body instanceof Node ? body : el('div', { html: body ?? '' })));
}

export function stat({ label, value, sub = '', iconName = 'trending', delta = null }) {
  const arrow = delta === null ? ''
    : `<span class="delta delta--${delta >= 0 ? 'up' : 'down'}">
        ${icon(delta >= 0 ? 'chevronUp' : 'chevronDown', { size: 13 })}${Math.abs(delta)}%</span>`;
  return `<article class="glass stat">
    <div class="stat-top">
      <span class="stat-icon">${icon(iconName, { size: 18 })}</span>
      <span class="stat-label">${esc(label)}</span>
    </div>
    <div class="stat-value">${esc(value)}</div>
    <div class="stat-sub">${arrow} ${esc(sub)}</div>
  </article>`;
}

export function toolbar(...children) {
  return el('div', { class: 'toolbar' }, ...children);
}

export function searchBox(placeholder, onInput) {
  const input = el('input', { class: 'input', type: 'search', placeholder, 'aria-label': placeholder });
  input.addEventListener('input', () => onInput(input.value));
  return el('div', { class: 'search' }, el('span', { html: icon('search') }), input);
}

/* ------------------------------------------------------------- row menus -- */

/** A "…" menu. One open at a time; closes on outside click or Escape. */
export function rowMenu(items) {
  const button = el('button', {
    class: 'btn btn--icon btn--quiet btn--sm', type: 'button',
    'aria-label': 'More actions', 'aria-haspopup': 'true', 'aria-expanded': 'false',
    html: icon('grip', { size: 16 }),
  });
  const wrap = el('div', { class: 'row-menu' }, button);

  const close = () => {
    wrap.querySelector('.row-menu-pop')?.remove();
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKey, true);
  };
  const onDocClick = (e) => { if (!wrap.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === 'Escape') { close(); button.focus(); } };

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (wrap.querySelector('.row-menu-pop')) return close();
    for (const other of $$('.row-menu-pop')) other.remove();

    const pop = el('div', { class: 'row-menu-pop', role: 'menu' },
      ...items.filter(Boolean).map((item) => (item === '-'
        ? el('hr')
        : el('button', {
          type: 'button', role: 'menuitem',
          class: item.danger ? 'danger' : '',
          html: `${icon(item.icon || 'chevronRight', { size: 16 })}<span>${esc(item.label)}</span>`,
          onclick: () => { close(); item.onSelect(); },
        }))));

    wrap.append(pop);
    button.setAttribute('aria-expanded', 'true');
    pop.querySelector('button')?.focus();
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey, true);
  });

  return wrap;
}

/* ---------------------------------------------------------------- charts -- */

/** A sparkline built from the values themselves — no chart library, and it
 *  degrades to a flat line rather than throwing when everything is zero. */
export function sparkline(values, { height = 76, stroke = 'var(--accent)' } = {}) {
  if (!values.length) return '';
  const w = 300;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const points = values.map((v, i) => [i * step, height - 8 - (v / max) * (height - 18)]);
  const line = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w} ${height} L0 ${height} Z`;

  return `<svg class="spark" viewBox="0 0 ${w} ${height}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${stroke}" stop-opacity="0.28"/>
      <stop offset="1" stop-color="${stroke}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#sparkfill)"/>
    <path d="${line}" fill="none" stroke="${stroke}" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

export function barList(rows, { format = (v) => v } = {}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (!rows.length) return '<p class="dim" style="font-size:.9rem">Nothing to show yet.</p>';
  return `<div class="bars">${rows.map((r) => `
    <div class="bar-row">
      <span>${esc(r.label)}</span>
      <span class="bar-value">${esc(format(r.value))}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${(r.value / max) * 100}%"></span></span>
    </div>`).join('')}</div>`;
}

/* ----------------------------------------------------------------- cells -- */

export function personCell(person, sub = '') {
  const photo = safeUrl(person?.photo_url);
  return `<div class="cell-person">
    <span class="avatar">${photo ? `<img src="${esc(photo)}" alt="">` : esc(initials(person?.name))}</span>
    <div><strong>${esc(person?.name || 'Unknown')}</strong>
      ${sub ? `<span>${esc(sub)}</span>` : ''}</div>
  </div>`;
}

export function whenCell(appointment, tz) {
  return `<div class="cell-when">
    <strong>${esc(fmtTime(appointment.starts_at, tz))}</strong>
    <span>${esc(fmtDate(appointment.starts_at, tz, 'long'))}</span>
  </div>`;
}

/* -------------------------------------------------- the appointment editor */

/**
 * One dialog for new bookings, walk-ins, edits and reschedules. The server
 * still owns overlap detection — this only shapes the request.
 */
export async function appointmentDialog({ ctx, appointment = null, defaults = {}, walkIn = false }) {
  const [services, barbers] = await Promise.all([
    ctx.api.services.list({ all: true }),
    ctx.api.barbers.list({ all: true }),
  ]);
  const tz = ctx.tz;
  const now = new Date();

  const startDate = appointment ? new Date(appointment.starts_at) : now;
  const ymd = defaults.date || ymdIn(startDate, tz);
  const hm = appointment
    ? minutesToHm(minutesIn(startDate, tz))
    : defaults.time || minutesToHm(Math.ceil(minutesIn(now, tz) / 15) * 15 % 1440);

  const values = await formDialog({
    title: appointment ? 'Edit appointment' : walkIn ? 'Add a walk-in' : 'New appointment',
    subtitle: appointment
      ? `Reference ${appointment.reference}`
      : walkIn
        ? 'Someone in the chair now. The lead-time rule does not apply.'
        : 'Booked on behalf of a customer — by phone, or at the counter.',
    iconName: appointment ? 'pencil' : 'plus',
    submitLabel: appointment ? 'Save changes' : 'Create appointment',
    wide: true,
    fields: [
      {
        type: 'group',
        fields: [
          { name: 'name', label: 'Customer name', required: true,
            value: appointment?.customer?.name || defaults.name || '' },
          { name: 'phone', label: 'Phone', required: true,
            value: appointment?.customer?.phone || defaults.phone || '',
            validate: (v) => (String(v).replace(/\D/g, '').length < 7 ? 'Needs at least 7 digits.' : '') },
        ],
      },
      { name: 'email', label: 'Email', type: 'email',
        value: appointment?.customer?.email || '', hint: 'Optional.' },
      {
        type: 'group',
        fields: [
          { name: 'service_id', label: 'Service', type: 'select', required: true,
            value: appointment?.service_id || defaults.serviceId || services[0]?.id,
            options: services.map((s) => ({
              value: s.id,
              label: `${s.name} · ${fmtDuration(s.duration_minutes)} · ${money(s.price_cents)}${s.is_active ? '' : ' (disabled)'}`,
            })) },
          { name: 'barber_id', label: 'Barber', type: 'select', required: true,
            value: appointment?.barber_id || defaults.barberId || barbers[0]?.id,
            options: barbers.map((b) => ({
              value: b.id,
              label: `${b.name}${b.on_vacation ? ' (away)' : ''}${b.is_active ? '' : ' (inactive)'}`,
            })) },
        ],
      },
      {
        type: 'group',
        fields: [
          { name: 'date', label: 'Date', type: 'date', required: true, value: ymd },
          { name: 'time', label: 'Start time', type: 'time', required: true, value: hm },
        ],
      },
      { name: 'status', label: 'Status', type: 'select',
        value: appointment?.status || (walkIn ? 'completed' : 'confirmed'),
        options: STATUS_OPTIONS },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 3,
        value: appointment?.notes || '', placeholder: 'Anything the barber should know.' },
    ],

    onSubmit: async (v) => {
      const startsAt = zonedToInstant(v.date, v.time, tz).toISOString();
      if (appointment) {
        return ctx.api.appointments.update(appointment.id, {
          service_id: v.service_id,
          barber_id: v.barber_id,
          starts_at: startsAt,
          status: v.status,
          notes: v.notes,
        }).then(async (row) => {
          // Customer details are edited on the customer, not the appointment.
          if (appointment.customer_id && (v.name !== appointment.customer?.name
            || v.phone !== appointment.customer?.phone
            || v.email !== (appointment.customer?.email || ''))) {
            await ctx.api.customers.update(appointment.customer_id, {
              name: v.name, phone: v.phone, email: v.email || null,
            });
          }
          return row;
        });
      }
      return ctx.api.appointments.create({
        serviceId: v.service_id,
        barberId: v.barber_id,
        startsAt,
        name: v.name,
        phone: v.phone,
        email: v.email || null,
        notes: v.notes,
        status: v.status,
        isWalkIn: walkIn,
      });
    },
  });

  if (values) {
    toast(appointment ? 'Appointment updated' : 'Appointment created');
  }
  return values;
}

/* ------------------------------------------------------- shared actions -- */

export function appointmentActions(appointment, ctx, refresh) {
  const set = async (patch, message) => {
    try {
      await ctx.api.appointments.update(appointment.id, patch);
      toast(message);
      refresh();
    } catch (err) {
      toastError(err);
    }
  };

  return [
    appointment.status === 'pending'
      ? { label: 'Approve', icon: 'check', onSelect: () => set({ status: 'confirmed' }, 'Appointment approved') }
      : null,
    appointment.status !== 'completed'
      ? { label: 'Mark completed', icon: 'checkCircle', onSelect: () => set({ status: 'completed' }, 'Marked completed') }
      : null,
    { label: 'Edit / reschedule', icon: 'pencil',
      onSelect: async () => { if (await appointmentDialog({ ctx, appointment })) refresh(); } },
    appointment.status !== 'no_show' && new Date(appointment.starts_at) < new Date()
      ? { label: 'Mark no-show', icon: 'ban', onSelect: () => set({ status: 'no_show' }, 'Marked as a no-show') }
      : null,
    '-',
    appointment.status !== 'cancelled'
      ? {
        label: 'Cancel', icon: 'xCircle', danger: true,
        onSelect: async () => {
          const ok = await confirmDialog({
            title: 'Cancel this appointment?',
            body: `${appointment.customer?.name} on ${fmtDate(appointment.starts_at, ctx.tz, 'long')} at ${fmtTime(appointment.starts_at, ctx.tz)}. The slot goes back on sale.`,
            confirmLabel: 'Cancel appointment', cancelLabel: 'Keep it', danger: true,
          });
          if (ok) set({ status: 'cancelled' }, 'Appointment cancelled');
        },
      }
      : null,
    {
      label: 'Delete', icon: 'trash', danger: true,
      onSelect: async () => {
        const ok = await confirmDialog({
          title: 'Delete permanently?',
          body: 'This removes the appointment from the record entirely. Cancelling is usually the right choice — it keeps the history.',
          confirmLabel: 'Delete', danger: true,
        });
        if (!ok) return;
        try {
          await ctx.api.appointments.remove(appointment.id);
          toast('Appointment deleted');
          refresh();
        } catch (err) {
          toastError(err);
        }
      },
    },
  ].filter(Boolean);
}
