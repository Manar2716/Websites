/* ==========================================================================
   Dashboard — what the shop needs to see when it opens the laptop.
   ========================================================================== */

import { icon } from '../icons.js';
import { el, esc, money, emptyState, skeletonRows } from '../ui.js';
import { addDays, fmtDate, fmtDayLabel, fmtTime, todayIn, zonedToInstant } from '../time.js';
import {
  panel, stat, statusBadge, sparkline, barList, rowMenu, personCell,
  appointmentDialog, appointmentActions,
} from './common.js';
import { setBadge } from './app.js';

export async function render({ view, actions, ctx, setTitle, app }) {
  setTitle('Dashboard', greeting(ctx.tz));

  actions.append(el('button', {
    class: 'btn btn--ghost btn--sm', type: 'button',
    html: `${icon('plus', { size: 16 })}Walk-in`,
    onclick: async () => { if (await appointmentDialog({ ctx, walkIn: true })) app.reload(); },
  }), el('button', {
    class: 'btn btn--primary btn--sm', type: 'button',
    html: `${icon('calendar', { size: 16 })}New appointment`,
    onclick: async () => { if (await appointmentDialog({ ctx })) app.reload(); },
  }));

  view.innerHTML = `<div class="stat-grid">
    ${'<div class="skeleton skeleton--card" style="height:132px"></div>'.repeat(4)}</div>
    <div class="glass panel"><div class="panel-body panel-body--flush">${skeletonRows(4)}</div></div>`;

  const today = todayIn(ctx.tz);
  const [stats, todays, upcoming] = await Promise.all([
    ctx.api.appointments.stats(),
    ctx.api.appointments.list({
      from: zonedToInstant(today, '00:00', ctx.tz).toISOString(),
      to: zonedToInstant(addDays(today, 1), '00:00', ctx.tz).toISOString(),
    }),
    ctx.api.appointments.list({
      from: zonedToInstant(addDays(today, 1), '00:00', ctx.tz).toISOString(),
      to: zonedToInstant(addDays(today, 8), '00:00', ctx.tz).toISOString(),
      limit: 60,
    }),
  ]);

  setBadge('appointments', stats.pending);

  const monthDelta = stats.revenue.previousMonth
    ? Math.round(((stats.revenue.month - stats.revenue.previousMonth) / stats.revenue.previousMonth) * 100)
    : null;

  view.innerHTML = '';

  view.append(el('div', {
    class: 'stat-grid',
    html: [
      stat({
        label: 'Today', iconName: 'calendar',
        value: String(stats.today.total),
        sub: `${stats.today.completed} done · ${stats.today.remaining} to come`,
      }),
      stat({
        label: 'Taken today', iconName: 'euro',
        value: money(stats.today.revenue),
        sub: `${money(stats.today.booked)} in the book`,
      }),
      stat({
        label: 'Last 30 days', iconName: 'trending',
        value: money(stats.revenue.month, { compact: true }),
        sub: 'vs the 30 before',
        delta: monthDelta,
      }),
      stat({
        label: 'Customers', iconName: 'users',
        value: String(stats.customers.total),
        sub: `${stats.customers.new30} new · ${stats.customers.returnRate}% return`,
      }),
    ].join(''),
  }));

  if (stats.pending) {
    view.append(pendingStrip(stats.pending, app));
  }

  /* ---- today + revenue ---- */
  const left = agendaPanel({
    title: `Today · ${fmtDate(new Date(), ctx.tz, 'long')}`,
    rows: todays,
    ctx,
    app,
    empty: {
      iconName: 'calendar',
      title: 'Nothing in the diary today',
      text: 'A quiet one. Walk-ins can still be added from the button above.',
    },
    showNow: true,
  });

  const revenueValues = stats.series.map((s) => s.revenue);
  const right = panel({
    title: 'Revenue',
    subtitle: 'Completed appointments, last 14 days',
    body: el('div', {
      html: `${sparkline(revenueValues)}
        <div class="kv" style="margin-top:var(--space-5)">
          ${kv('Today', money(stats.revenue.today))}
          ${kv('This week', money(stats.revenue.week))}
          ${kv('Last 30 days', money(stats.revenue.month))}
          ${kv('Average ticket', money(stats.revenue.averageTicket))}
          ${kv('No-show rate', `${stats.noShowRate}%`)}
        </div>`,
    }),
  });

  view.append(el('div', { class: 'two-col' }, left, right));

  /* ---- upcoming + breakdowns ---- */
  view.append(el('div', { class: 'two-col' },
    agendaPanel({
      title: 'Coming up',
      subtitle: 'The next seven days',
      rows: upcoming.filter((a) => a.status !== 'cancelled').slice(0, 12),
      ctx,
      app,
      withDay: true,
      empty: {
        iconName: 'calendar', title: 'The week ahead is empty',
        text: 'Nothing booked in the next seven days yet.',
      },
    }),
    el('div', { style: 'display:grid;gap:var(--space-5)' },
      panel({
        title: 'By barber',
        subtitle: 'Completed, last 30 days',
        body: el('div', {
          html: barList(stats.byBarber.map((b) => ({ label: b.name, value: b.revenue })),
            { format: (v) => money(v, { compact: true }) }),
        }),
      }),
      panel({
        title: 'Most booked',
        subtitle: 'Last 30 days',
        body: el('div', {
          html: barList(stats.byService.map((s) => ({ label: s.name, value: s.count })),
            { format: (v) => `${v}` }),
        }),
      }))));
}

/* ------------------------------------------------------------------------ */

function kv(label, value) {
  return `<div class="kv-row"><dt>${esc(label)}</dt>
    <dd style="font-weight:600;font-variant-numeric:tabular-nums">${esc(value)}</dd></div>`;
}

function greeting(tz) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz })
    .format(new Date()));
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${part} — ${fmtDate(new Date(), tz, 'full')}`;
}

function pendingStrip(count, app) {
  return el('section', {
    class: 'glass panel',
    style: 'border-color:var(--accent-line)',
  }, el('div', {
    class: 'panel-body',
    style: 'display:flex;align-items:center;gap:var(--space-4);flex-wrap:wrap',
  },
  el('span', { class: 'stat-icon', html: icon('bell', { size: 18 }) }),
  el('div', { style: 'flex:1;min-width:200px' },
    el('strong', { text: `${count} booking${count === 1 ? '' : 's'} waiting for approval` }),
    el('p', { class: 'dim', style: 'font-size:.85rem',
      text: 'Customers are holding these slots until you confirm them.' })),
  el('button', {
    class: 'btn btn--primary btn--sm', type: 'button', text: 'Review them',
    onclick: () => app.navigate('appointments', '?status=pending'),
  })));
}

function agendaPanel({ title, subtitle = '', rows, ctx, app, empty, withDay = false, showNow = false }) {
  const body = el('div', { class: 'agenda' });

  if (!rows.length) {
    body.innerHTML = emptyState(empty);
  } else {
    const now = Date.now();
    for (const a of rows) {
      const past = new Date(a.ends_at).getTime() < now;
      const item = el('div', {
        class: `agenda-item ${past && showNow ? 'is-past' : ''}`,
      },
      el('div', { class: 'agenda-time', html: `${esc(fmtTime(a.starts_at, ctx.tz))}
          <span>${withDay ? esc(fmtDayLabel(dayOf(a.starts_at, ctx.tz), ctx.tz)) : esc(fmtTime(a.ends_at, ctx.tz))}</span>` }),
      el('div', { class: 'agenda-main', html: `${personCell(a.customer, `${a.service?.name} · ${a.barber?.name}`)}` }),
      el('div', { style: 'display:flex;align-items:center;gap:var(--space-3)' },
        el('span', { html: statusBadge(a.status) }),
        rowMenu(appointmentActions(a, ctx, app.reload))));
      body.append(item);
    }
  }

  return panel({ title, subtitle, flush: true, body });
}

function dayOf(iso, tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
}
