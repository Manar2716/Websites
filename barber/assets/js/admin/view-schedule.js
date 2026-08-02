/* ==========================================================================
   Schedule — opening hours, breaks, holidays, blocked slots, booking rules.
   ========================================================================== */

import { icon } from '../icons.js';
import {
  el, esc, emptyState, formDialog, confirmDialog, toast, toastError,
} from '../ui.js';
import {
  WEEKDAYS, fmtDate, fmtTime, todayIn, zonedToInstant, addDays, ymdIn, minutesToHm, minutesIn,
} from '../time.js';
import { panel } from './common.js';

export async function render({ view, actions, ctx, setTitle }) {
  setTitle('Schedule', 'When the shop is open, and when it is not.');

  actions.append(el('button', {
    class: 'btn btn--primary btn--sm', type: 'button',
    html: `${icon('ban', { size: 16 })}Block time`,
    onclick: () => blockDialog(),
  }));

  const hoursBody = el('div');
  const rulesBody = el('div');
  const blocksBody = el('div', { class: 'agenda' });

  view.append(el('div', { class: 'two-col' },
    panel({
      title: 'Opening hours',
      subtitle: 'The default week. Individual barbers can override any day from their profile.',
      body: hoursBody,
    }),
    panel({
      title: 'Booking rules',
      subtitle: 'How the diary is carved up.',
      body: rulesBody,
    })));

  view.append(panel({
    title: 'Holidays and blocked time',
    subtitle: 'Nothing can be booked inside these. Shop-wide unless a barber is named.',
    flush: true,
    body: blocksBody,
  }));

  /* ------------------------------------------------------------- hours -- */
  async function loadHours() {
    const schedules = await ctx.api.schedules.list(null);
    hoursBody.innerHTML = '';

    for (const [weekday, label] of WEEKDAYS.entries()) {
      const s = schedules.find((x) => x.weekday === weekday)
        || { weekday, is_closed: true, opens_at: '09:00', closes_at: '18:00' };

      const times = el('div', { class: 'day-times' });
      const row = el('div', { class: 'day-row' },
        el('strong', { text: label }),
        el('label', { class: 'switch', title: 'Open this day' },
          el('input', {
            type: 'checkbox', checked: !s.is_closed,
            'aria-label': `Open on ${label}`,
            onchange: (e) => saveDay(weekday, { is_closed: !e.target.checked }, times, e.target.checked, s),
          }),
          el('span', { class: 'switch-track' })),
        times);

      drawTimes(times, s, !s.is_closed, weekday);
      hoursBody.append(row);
    }
  }

  function drawTimes(wrap, s, open, weekday) {
    if (!open) {
      wrap.innerHTML = '<span class="day-closed">Closed</span>';
      return;
    }
    wrap.innerHTML = `
      <span class="pair">
        <input class="input" type="time" data-k="opens_at" value="${esc((s.opens_at || '09:00').slice(0, 5))}" aria-label="Opens">
        <span class="sep">–</span>
        <input class="input" type="time" data-k="closes_at" value="${esc((s.closes_at || '18:00').slice(0, 5))}" aria-label="Closes">
      </span>
      <span class="pair">
        <span class="pair-label">Break</span>
        <input class="input" type="time" data-k="break_start" value="${esc((s.break_start || '').slice(0, 5))}" aria-label="Break starts">
        <span class="sep">–</span>
        <input class="input" type="time" data-k="break_end" value="${esc((s.break_end || '').slice(0, 5))}" aria-label="Break ends">
      </span>`;

    for (const input of wrap.querySelectorAll('input')) {
      input.addEventListener('change', () => {
        const patch = {};
        for (const i of wrap.querySelectorAll('input')) patch[i.dataset.k] = i.value || null;
        if (patch.opens_at && patch.closes_at && patch.closes_at <= patch.opens_at) {
          toast('Closing time must be after opening', { type: 'error' });
          return;
        }
        if (Boolean(patch.break_start) !== Boolean(patch.break_end)) return; // half-entered
        saveDay(weekday, { ...patch, is_closed: false });
      });
    }
  }

  async function saveDay(weekday, patch, times = null, open = null, previous = null) {
    try {
      const current = (await ctx.api.schedules.list(null)).find((s) => s.weekday === weekday) || {};
      const row = {
        barber_id: null,
        weekday,
        is_closed: patch.is_closed ?? current.is_closed ?? false,
        opens_at: patch.opens_at ?? current.opens_at ?? '09:00',
        closes_at: patch.closes_at ?? current.closes_at ?? '18:00',
        break_start: 'break_start' in patch ? patch.break_start : (current.break_start ?? null),
        break_end: 'break_end' in patch ? patch.break_end : (current.break_end ?? null),
      };
      await ctx.api.schedules.upsert(row);
      toast(`${WEEKDAYS[weekday]} saved`, { timeout: 1800 });
      if (times) drawTimes(times, row, open, weekday);
    } catch (err) {
      toastError(err);
      loadHours();
    }
    void previous;
  }

  /* ------------------------------------------------------------- rules -- */
  function loadRules() {
    const s = ctx.settings;
    rulesBody.innerHTML = `
      <dl class="kv">
        ${ruleRow('Booking interval', `Every ${s.booking_interval_minutes} minutes`,
          'The spacing of the start times customers see.')}
        ${ruleRow('Default length', `${s.default_duration_minutes} minutes`,
          'Used for new services until you change theirs.')}
        ${ruleRow('Gap after each cut', s.buffer_minutes ? `${s.buffer_minutes} minutes` : 'None',
          'Tidy-up time held after every appointment.')}
        ${ruleRow('Shortest notice', `${s.lead_time_minutes} minutes`,
          'How soon before a slot it can still be booked online.')}
        ${ruleRow('Booking horizon', `${s.max_advance_days} days`,
          'How far ahead the calendar opens.')}
        ${ruleRow('Confirmation', s.auto_confirm ? 'Automatic' : 'Manual',
          s.auto_confirm ? 'Bookings are confirmed instantly.' : 'You approve each new booking.')}
      </dl>
      <div class="editor-foot">
        <button class="btn btn--ghost btn--sm" type="button" id="edit-rules">
          ${icon('settings', { size: 16 })}Change rules</button>
      </div>`;

    rulesBody.querySelector('#edit-rules').onclick = () => rulesDialog();
  }

  function ruleRow(label, value, hint) {
    return `<div class="kv-row"><dt>${esc(label)}</dt>
      <dd><strong>${esc(value)}</strong>
        <span class="dim" style="display:block;font-size:.8rem">${esc(hint)}</span></dd></div>`;
  }

  async function rulesDialog() {
    const s = ctx.settings;
    const values = await formDialog({
      title: 'Booking rules',
      subtitle: 'These apply to every online booking.',
      iconName: 'settings',
      submitLabel: 'Save rules',
      wide: true,
      fields: [
        {
          type: 'group',
          fields: [
            { name: 'booking_interval_minutes', label: 'Booking interval (minutes)', type: 'number',
              min: 5, max: 120, step: 5, value: s.booking_interval_minutes, required: true,
              hint: 'Start times appear this far apart.' },
            { name: 'default_duration_minutes', label: 'Default length (minutes)', type: 'number',
              min: 5, max: 480, step: 5, value: s.default_duration_minutes, required: true },
          ],
        },
        {
          type: 'group',
          fields: [
            { name: 'buffer_minutes', label: 'Gap after each cut (minutes)', type: 'number',
              min: 0, max: 120, step: 5, value: s.buffer_minutes },
            { name: 'lead_time_minutes', label: 'Shortest notice (minutes)', type: 'number',
              min: 0, max: 10080, step: 15, value: s.lead_time_minutes },
          ],
        },
        { name: 'max_advance_days', label: 'Booking horizon (days)', type: 'number',
          min: 1, max: 365, value: s.max_advance_days, required: true },
        { name: 'auto_confirm', type: 'switch', label: 'Confirm bookings automatically',
          value: s.auto_confirm,
          hint: 'Off means new bookings arrive as Pending and wait for you.' },
      ],
      onSubmit: (v) => ctx.api.settings.update(v),
    });

    if (values) {
      Object.assign(ctx.settings, values);
      toast('Rules saved');
      loadRules();
    }
  }

  /* ------------------------------------------------------------ blocks -- */
  async function loadBlocks() {
    const blocks = await ctx.api.schedules.listBlocks({
      from: zonedToInstant(addDays(todayIn(ctx.tz), -1), '00:00', ctx.tz).toISOString(),
    });

    if (!blocks.length) {
      blocksBody.innerHTML = emptyState({
        iconName: 'calendar',
        title: 'No blocked time',
        text: 'Add a holiday, a training day or an afternoon off and the diary closes around it.',
      });
      return;
    }

    blocksBody.innerHTML = '';
    for (const b of blocks) {
      const fullDay = isFullDay(b, ctx.tz);
      blocksBody.append(el('div', { class: 'agenda-item' },
        el('div', { class: 'agenda-time',
          html: `${esc(fmtDate(b.starts_at, ctx.tz, 'short'))}
            <span>${fullDay ? 'all day' : esc(fmtTime(b.starts_at, ctx.tz))}</span>` }),
        el('div', { class: 'agenda-main' },
          el('strong', { text: b.reason || labelFor(b.kind) }),
          el('span', { text: `${b.barber?.name ? `${b.barber.name} only` : 'Whole shop'} · `
            + `${fmtDate(b.starts_at, ctx.tz, 'long')}${fullDay ? '' : ` ${fmtTime(b.starts_at, ctx.tz)}`}`
            + ` → ${fmtDate(b.ends_at, ctx.tz, 'long')}${fullDay ? '' : ` ${fmtTime(b.ends_at, ctx.tz)}`}` })),
        el('div', { style: 'display:flex;gap:var(--space-2);align-items:center' },
          el('span', { class: `badge ${b.kind === 'holiday' ? 'badge--info' : 'badge--warn'}`,
            text: labelFor(b.kind) }),
          el('button', {
            class: 'btn btn--icon btn--quiet btn--sm', type: 'button',
            'aria-label': 'Remove this block', html: icon('trash', { size: 16 }),
            onclick: () => removeBlock(b),
          }))));
    }
  }

  async function blockDialog() {
    const barbers = await ctx.api.barbers.list({ all: true });
    const today = todayIn(ctx.tz);
    const nowHm = minutesToHm(Math.ceil(minutesIn(new Date(), ctx.tz) / 15) * 15 % 1440);

    const values = await formDialog({
      title: 'Block out time',
      subtitle: 'A holiday, a training day, or an hour for the dentist.',
      iconName: 'ban',
      submitLabel: 'Block it',
      wide: true,
      fields: [
        { name: 'kind', label: 'Type', type: 'select', value: 'holiday',
          options: [
            { value: 'holiday', label: 'Holiday — shop closed' },
            { value: 'vacation', label: 'Vacation — one barber away' },
            { value: 'block', label: 'Blocked slot — part of a day' },
          ] },
        { name: 'barber_id', label: 'Applies to', type: 'select', value: '',
          options: [{ value: '', label: 'The whole shop' },
            ...barbers.map((b) => ({ value: b.id, label: b.name }))] },
        { name: 'reason', label: 'Reason', value: '', placeholder: 'Staff training day',
          hint: 'Only you see this.' },
        { name: 'all_day', type: 'switch', label: 'All day', value: true },
        {
          type: 'group',
          fields: [
            { name: 'from_date', label: 'From', type: 'date', value: today, required: true },
            { name: 'from_time', label: 'Start time', type: 'time', value: nowHm },
          ],
        },
        {
          type: 'group',
          fields: [
            { name: 'to_date', label: 'To (inclusive)', type: 'date', value: today, required: true },
            { name: 'to_time', label: 'End time', type: 'time', value: '23:59' },
          ],
        },
      ],
      onSubmit: async (v) => {
        const starts = v.all_day
          ? zonedToInstant(v.from_date, '00:00', ctx.tz)
          : zonedToInstant(v.from_date, v.from_time || '00:00', ctx.tz);
        const ends = v.all_day
          ? zonedToInstant(addDays(v.to_date, 1), '00:00', ctx.tz)
          : zonedToInstant(v.to_date, v.to_time || '23:59', ctx.tz);

        if (ends <= starts) throw new Error('The end has to come after the start.');

        return ctx.api.schedules.createBlock({
          barber_id: v.barber_id || null,
          kind: v.kind,
          reason: v.reason,
          starts_at: starts.toISOString(),
          ends_at: ends.toISOString(),
        });
      },
    });

    if (values) {
      toast('Time blocked', { text: 'Nothing can be booked in that window now.' });
      loadBlocks();
    }
  }

  async function removeBlock(block) {
    const ok = await confirmDialog({
      title: 'Remove this block?',
      body: 'Those hours become bookable again straight away.',
      confirmLabel: 'Remove', danger: true,
    });
    if (!ok) return;
    try {
      await ctx.api.schedules.removeBlock(block.id);
      toast('Block removed');
    } catch (err) {
      toastError(err);
    }
    loadBlocks();
  }

  await Promise.all([loadHours(), loadBlocks()]);
  loadRules();
}

function labelFor(kind) {
  return { holiday: 'Holiday', vacation: 'Vacation', block: 'Blocked' }[kind] || 'Blocked';
}

function isFullDay(block, tz) {
  return minutesIn(new Date(block.starts_at), tz) === 0
    && ymdIn(new Date(block.ends_at), tz) !== ymdIn(new Date(block.starts_at), tz);
}
