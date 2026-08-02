/* ==========================================================================
   Appointments — search, filter, approve, reschedule, complete, delete.
   ========================================================================== */

import { icon } from '../icons.js';
import { el, esc, money, emptyState, skeletonRows, debounce, toast, toastError } from '../ui.js';
import {
  addDays, fmtDate, fmtDayLabel, fmtDuration, fmtTime, startOfWeek, todayIn, zonedToInstant,
} from '../time.js';
import {
  panel, statusBadge, STATUS_OPTIONS, rowMenu, personCell, searchBox, toolbar,
  appointmentDialog, appointmentActions,
} from './common.js';

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'all', label: 'All' },
];

export async function render({ view, actions, ctx, params, setTitle }) {
  setTitle('Appointments', 'The whole diary, in one list.');

  const state = {
    range: params.get('range') || 'upcoming',
    status: params.get('status') || '',
    barberId: params.get('barber') || '',
    search: params.get('q') || '',
  };

  actions.append(el('button', {
    class: 'btn btn--ghost btn--sm', type: 'button',
    html: `${icon('plus', { size: 16 })}Walk-in`,
    onclick: async () => { if (await appointmentDialog({ ctx, walkIn: true })) load(); },
  }), el('button', {
    class: 'btn btn--primary btn--sm', type: 'button',
    html: `${icon('calendar', { size: 16 })}New`,
    onclick: async () => { if (await appointmentDialog({ ctx })) load(); },
  }));

  const barbers = await ctx.api.barbers.list({ all: true });

  /* ---- controls ---- */
  const ranges = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Date range' },
    ...RANGES.map((r) => el('button', {
      type: 'button', text: r.label,
      'aria-pressed': String(state.range === r.key),
      onclick: () => { state.range = r.key; syncButtons(); load(); },
    })));

  const statusSelect = el('select', { class: 'select', style: 'width:auto', 'aria-label': 'Status' },
    el('option', { value: '' }, 'Any status'),
    ...STATUS_OPTIONS.map((o) => el('option', {
      value: o.value, selected: state.status === o.value,
    }, o.label)));
  statusSelect.addEventListener('change', () => { state.status = statusSelect.value; load(); });

  const barberSelect = el('select', { class: 'select', style: 'width:auto', 'aria-label': 'Barber' },
    el('option', { value: '' }, 'All barbers'),
    ...barbers.map((b) => el('option', {
      value: b.id, selected: state.barberId === b.id,
    }, b.name)));
  barberSelect.addEventListener('change', () => { state.barberId = barberSelect.value; load(); });

  const search = searchBox('Search name, phone, email or reference…',
    debounce((value) => { state.search = value; load(); }, 240));
  search.querySelector('input').value = state.search;

  const body = el('div', { class: 'panel-body panel-body--flush' });
  const summary = el('p', { class: 'dim', style: 'font-size:.82rem;width:100%;margin-top:-4px' });

  const board = panel({
    title: 'Diary',
    actions: toolbar(search, ranges, statusSelect, barberSelect),
    flush: true,
    body,
  });
  board.querySelector('.panel-head').append(summary);
  view.append(board);

  function syncButtons() {
    for (const [i, btn] of [...ranges.children].entries()) {
      btn.setAttribute('aria-pressed', String(RANGES[i].key === state.range));
    }
  }

  async function load() {
    body.innerHTML = skeletonRows(6);
    const bounds = rangeBounds(state.range, ctx.tz);

    try {
      const rows = await ctx.api.appointments.list({
        ...bounds,
        status: state.status || null,
        barberId: state.barberId || null,
        search: state.search,
        limit: 500,
      });
      draw(state.range === 'past' ? rows.slice().reverse() : rows);
    } catch (err) {
      toastError(err);
      body.innerHTML = emptyState({ iconName: 'alert', title: 'Could not load appointments' });
    }
  }

  function draw(rows) {
    const revenue = rows.filter((r) => r.status !== 'cancelled')
      .reduce((sum, r) => sum + r.price_cents, 0);
    summary.textContent = rows.length
      ? `${rows.length} appointment${rows.length === 1 ? '' : 's'} · ${money(revenue)} booked`
      : '';

    if (!rows.length) {
      body.innerHTML = emptyState({
        iconName: 'calendar',
        title: 'No appointments match',
        text: 'Try a wider range, or clear the filters.',
      });
      return;
    }

    const table = el('table', { class: 'data' },
      el('thead', {}, el('tr', {}, ...['When', 'Customer', 'Service', 'Barber', 'Status', 'Price', '']
        .map((h, i) => el('th', { class: i === 5 ? 'num' : '' }, h)))));

    const tbody = el('tbody');
    let lastDay = null;

    for (const a of rows) {
      const day = fmtDayLabel(dayOf(a.starts_at, ctx.tz), ctx.tz);
      if (day !== lastDay) {
        lastDay = day;
        tbody.append(el('tr', {}, el('td', {
          colspan: 7,
          style: 'background:var(--surface-sunk);font-size:.75rem;letter-spacing:.06em;'
            + 'text-transform:uppercase;color:var(--text-3);font-weight:620;padding:8px 16px',
          text: `${day} · ${fmtDate(a.starts_at, ctx.tz, 'medium')}`,
        })));
      }

      tbody.append(el('tr', { dataset: { id: a.id } },
        el('td', { html: `<div class="cell-when"><strong>${esc(fmtTime(a.starts_at, ctx.tz))}</strong>
          <span>${esc(fmtTime(a.ends_at, ctx.tz))}</span></div>` }),
        el('td', { html: personCell(a.customer, a.customer?.phone || '') }),
        el('td', { html: `${esc(a.service?.name || '—')}
          <span class="dim" style="display:block;font-size:.78rem">
          ${a.service ? fmtDuration(a.service.duration_minutes) : ''}${a.is_walk_in ? ' · walk-in' : ''}</span>` }),
        el('td', { text: a.barber?.name || '—' }),
        el('td', { html: statusBadge(a.status) }),
        el('td', { class: 'num', text: money(a.price_cents) }),
        el('td', { class: 'actions' }, quickActions(a), rowMenu(appointmentActions(a, ctx, load)))));
    }

    table.append(tbody);
    body.innerHTML = '';
    body.append(el('div', { class: 'table-wrap' }, table));
  }

  function quickActions(a) {
    if (a.status === 'pending') {
      return el('button', {
        class: 'btn btn--sm btn--ghost', type: 'button',
        html: `${icon('check', { size: 15 })}Approve`,
        onclick: async () => {
          try {
            await ctx.api.appointments.update(a.id, { status: 'confirmed' });
            toast('Appointment approved', { text: `${a.customer?.name} is confirmed.` });
            load();
          } catch (err) { toastError(err); }
        },
      });
    }
    if (a.status === 'confirmed' && new Date(a.starts_at) < new Date()) {
      return el('button', {
        class: 'btn btn--sm btn--ghost', type: 'button',
        html: `${icon('checkCircle', { size: 15 })}Complete`,
        onclick: async () => {
          try {
            await ctx.api.appointments.update(a.id, { status: 'completed' });
            toast('Marked completed');
            load();
          } catch (err) { toastError(err); }
        },
      });
    }
    return null;
  }

  await load();
}

/* ------------------------------------------------------------------------ */

function rangeBounds(range, tz) {
  const today = todayIn(tz);
  const at = (ymd) => zonedToInstant(ymd, '00:00', tz).toISOString();

  switch (range) {
    case 'today':
      return { from: at(today), to: at(addDays(today, 1)) };
    case 'week': {
      const start = startOfWeek(today);
      return { from: at(start), to: at(addDays(start, 7)) };
    }
    case 'past':
      return { from: at(addDays(today, -90)), to: new Date().toISOString() };
    case 'all':
      return {};
    case 'upcoming':
    default:
      return { from: new Date().toISOString(), to: at(addDays(today, 90)) };
  }
}

function dayOf(iso, tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
}
