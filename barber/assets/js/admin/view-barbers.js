/* ==========================================================================
   Barbers — profile, photo, specialities, vacation mode, working hours.
   ========================================================================== */

import { icon } from '../icons.js';
import {
  el, esc, safeUrl, initials, emptyState, formDialog, confirmDialog, toast, toastError,
  makeSortable, pickFile, fileToDataUrl,
} from '../ui.js';
import { WEEKDAYS } from '../time.js';
import { panel } from './common.js';

export async function render({ view, actions, ctx, setTitle }) {
  setTitle('Barbers', 'Profiles, photos and who is behind which chair.');

  actions.append(el('button', {
    class: 'btn btn--primary btn--sm', type: 'button',
    html: `${icon('plus', { size: 16 })}Add barber`,
    onclick: () => edit(null),
  }));

  const list = el('div', { class: 'sortable' });
  view.append(panel({
    title: 'The team',
    subtitle: 'Drag to set the order they appear in on the website and in booking.',
    body: list,
  }));

  async function load() {
    const barbers = await ctx.api.barbers.list({ all: true });

    if (!barbers.length) {
      list.innerHTML = emptyState({
        iconName: 'users', title: 'No barbers yet',
        text: 'Add someone before customers can book.',
      });
      return;
    }

    list.innerHTML = '';
    for (const b of barbers) {
      const photo = safeUrl(b.photo_url);
      list.append(el('div', { class: 'sort-row', dataset: { id: b.id } },
        el('button', {
          class: 'drag-handle', type: 'button', 'data-drag-handle': '',
          'aria-label': `Reorder ${b.name}. Use the arrow keys.`,
          html: icon('grip', { size: 17 }),
        }),
        el('span', {
          class: 'avatar', style: '--avatar:44px;margin:0',
          html: photo ? `<img src="${esc(photo)}" alt="">` : esc(initials(b.name)),
        }),
        el('div', { class: 'sort-main' },
          el('strong', { text: b.name }),
          el('span', { text: b.title || (b.specialties || []).join(' · ') || 'Barber' })),
        el('div', { class: 'sort-side' },
          el('span', { html: badgeFor(b) }),
          el('button', {
            class: 'btn btn--ghost btn--sm', type: 'button',
            html: `${icon('clock', { size: 15 })}Hours`,
            onclick: () => hours(b),
          }),
          el('button', {
            class: 'btn btn--icon btn--quiet btn--sm', type: 'button', 'aria-label': `Edit ${b.name}`,
            html: icon('pencil', { size: 16 }), onclick: () => edit(b),
          }),
          el('button', {
            class: 'btn btn--icon btn--quiet btn--sm', type: 'button', 'aria-label': `Remove ${b.name}`,
            html: icon('trash', { size: 16 }), onclick: () => remove(b),
          }))));
    }
  }

  makeSortable(list, async (ids) => {
    try {
      await ctx.api.barbers.reorder(ids);
      toast('Order saved');
    } catch (err) {
      toastError(err);
      load();
    }
  });

  function badgeFor(b) {
    if (!b.is_active) return '<span class="badge">Inactive</span>';
    if (b.on_vacation) return '<span class="badge badge--warn">Away</span>';
    return '<span class="badge badge--ok">Taking bookings</span>';
  }

  async function edit(barber) {
    // Photo is handled outside the form fields so the picker can preview.
    let photoUrl = barber?.photo_url || '';

    const values = await formDialog({
      title: barber ? `Edit ${barber.name}` : 'Add a barber',
      subtitle: 'Everything here shows on the public profile.',
      iconName: barber ? 'pencil' : 'plus',
      submitLabel: barber ? 'Save' : 'Add barber',
      wide: true,
      fields: [
        {
          type: 'group',
          fields: [
            { name: 'name', label: 'Name', required: true, value: barber?.name || '' },
            { name: 'title', label: 'Job title', value: barber?.title || '',
              placeholder: 'Senior Barber' },
          ],
        },
        { name: 'bio', label: 'Bio', type: 'textarea', rows: 4, value: barber?.bio || '',
          placeholder: 'Two or three sentences in the shop’s voice.' },
        { name: 'specialties', label: 'Specialities', value: (barber?.specialties || []).join(', '),
          placeholder: 'Skin fades, Beard sculpting, Line-ups',
          hint: 'Comma separated. These show as tags.' },
        {
          type: 'group',
          fields: [
            { name: 'instagram', label: 'Instagram handle', value: barber?.instagram || '',
              placeholder: '@name' },
            { name: 'photo_url', label: 'Photo URL', value: photoUrl,
              hint: 'Or use Upload below.' },
          ],
        },
        { name: 'on_vacation', type: 'switch', label: 'Vacation mode',
          value: barber?.on_vacation ?? false,
          hint: 'Hides them from booking and blocks new appointments. Existing ones stay.' },
        { name: 'vacation_note', label: 'Away note', value: barber?.vacation_note || '',
          placeholder: 'Back on the 14th' },
        { name: 'is_active', type: 'switch', label: 'Show on the website',
          value: barber?.is_active ?? true },
      ],
      onSubmit: async (v) => {
        const payload = {
          name: v.name,
          title: v.title,
          bio: v.bio,
          specialties: v.specialties.split(',').map((s) => s.trim()).filter(Boolean),
          instagram: v.instagram,
          photo_url: v.photo_url || null,
          on_vacation: v.on_vacation,
          vacation_note: v.vacation_note,
          is_active: v.is_active,
        };
        if (barber) return ctx.api.barbers.update(barber.id, payload);
        return ctx.api.barbers.create(payload);
      },
    });

    if (values) {
      toast(barber ? 'Profile updated' : 'Barber added');
      load();
    }
    void photoUrl;
  }

  async function remove(barber) {
    const ok = await confirmDialog({
      title: `Remove ${barber.name}?`,
      body: 'If they have appointments in the diary, turn off "Show on the website" instead — '
        + 'deleting is refused while history exists.',
      confirmLabel: 'Remove', danger: true,
    });
    if (!ok) return;
    try {
      await ctx.api.barbers.remove(barber.id);
      toast('Barber removed');
    } catch (err) {
      toastError(err);
    }
    load();
  }

  /* ---- per-barber working hours ---- */
  async function hours(barber) {
    const [own, shop] = await Promise.all([
      ctx.api.schedules.list(barber.id),
      ctx.api.schedules.list(null),
    ]);

    const rows = WEEKDAYS.map((label, weekday) => {
      const mine = own.find((s) => s.weekday === weekday);
      const base = shop.find((s) => s.weekday === weekday);
      return { weekday, label, mine, base };
    });

    const body = el('div', { class: 'modal-body' });
    body.innerHTML = `<p class="dim" style="font-size:.85rem;margin-bottom:var(--space-4)">
      Leave a day on <strong>Shop hours</strong> to follow the opening times in Schedule.
      Override only the days this barber works differently.</p>`;

    for (const r of rows) {
      const custom = Boolean(r.mine);
      const row = el('div', { class: 'day-row' },
        el('strong', { text: r.label }),
        el('label', { class: 'switch' },
          el('input', { type: 'checkbox', checked: custom, dataset: { day: String(r.weekday) },
            'aria-label': `Custom hours on ${r.label}` }),
          el('span', { class: 'switch-track' })),
        el('div', { class: 'day-times' }));
      drawTimes(row, r, custom);
      body.append(row);
      row.querySelector('input[type=checkbox]').addEventListener('change', (e) => {
        drawTimes(row, r, e.target.checked);
      });
    }

    const dlg = el('dialog', { class: 'modal modal--wide' },
      el('div', { class: 'modal-head' },
        el('div', { class: 'modal-glyph', html: icon('clock', { size: 22 }) }),
        el('div', {}, el('h3', { text: `${barber.name}'s hours` }),
          el('p', { text: 'Overrides the shop opening hours for this barber only.' }))),
      body,
      el('div', { class: 'modal-foot' },
        el('button', { class: 'btn btn--ghost', type: 'button', text: 'Cancel',
          onclick: () => dlg.close() }),
        el('button', { class: 'btn btn--primary', type: 'button', text: 'Save hours',
          onclick: () => save() })));

    document.body.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal();

    async function save() {
      try {
        const keep = [];
        for (const row of body.querySelectorAll('.day-row')) {
          const weekday = Number(row.querySelector('[data-day]').dataset.day);
          if (!row.querySelector('[data-day]').checked) continue;
          const inputs = row.querySelectorAll('.day-times input[type=time]');
          const closed = row.querySelector('[data-closed]')?.checked ?? false;
          keep.push({
            barber_id: barber.id,
            weekday,
            is_closed: closed,
            opens_at: inputs[0]?.value || '09:00',
            closes_at: inputs[1]?.value || '18:00',
            break_start: inputs[2]?.value || null,
            break_end: inputs[3]?.value || null,
          });
        }
        await ctx.api.schedules.clearBarber(barber.id);
        for (const row of keep) await ctx.api.schedules.upsert(row);
        toast('Hours saved', { text: `${barber.name}'s week is updated.` });
        dlg.close();
      } catch (err) {
        toastError(err);
      }
    }
  }

  function drawTimes(row, r, custom) {
    const wrap = row.querySelector('.day-times');
    if (!custom) {
      const base = r.base;
      wrap.innerHTML = `<span class="day-closed">Shop hours — ${base && !base.is_closed
        ? `${base.opens_at.slice(0, 5)} – ${base.closes_at.slice(0, 5)}` : 'closed'}</span>`;
      return;
    }
    const s = r.mine || r.base || {};
    wrap.innerHTML = `
      <label class="switch" style="margin-right:8px">
        <input type="checkbox" data-closed ${s.is_closed ? 'checked' : ''} aria-label="Day off">
        <span class="switch-track"></span><span class="label">Day off</span>
      </label>
      <span class="pair">
        <input class="input" type="time" value="${esc((s.opens_at || '09:00').slice(0, 5))}" aria-label="Opens">
        <span class="sep">–</span>
        <input class="input" type="time" value="${esc((s.closes_at || '18:00').slice(0, 5))}" aria-label="Closes">
      </span>
      <span class="pair">
        <span class="pair-label">Break</span>
        <input class="input" type="time" value="${esc((s.break_start || '').slice(0, 5))}" aria-label="Break starts">
        <span class="sep">–</span>
        <input class="input" type="time" value="${esc((s.break_end || '').slice(0, 5))}" aria-label="Break ends">
      </span>`;
  }

  /* ---- photo upload, offered from the toolbar ---- */
  actions.prepend(el('button', {
    class: 'btn btn--ghost btn--sm', type: 'button',
    html: `${icon('upload', { size: 16 })}Upload photo`,
    onclick: async () => {
      const barbers = await ctx.api.barbers.list({ all: true });
      if (!barbers.length) return toast('Add a barber first', { type: 'info' });
      const values = await formDialog({
        title: 'Upload a photo',
        subtitle: 'Pick who it belongs to, then choose the file.',
        iconName: 'image',
        submitLabel: 'Choose file',
        fields: [{
          name: 'barber_id', label: 'Barber', type: 'select',
          options: barbers.map((b) => ({ value: b.id, label: b.name })),
        }],
      });
      if (!values) return;
      const file = await pickFile('image/*');
      if (!file) return;
      try {
        const dataUrl = await fileToDataUrl(file, 900, 0.85);
        const url = await ctx.api.storage.upload(dataUrl, 'barbers');
        await ctx.api.barbers.update(values.barber_id, { photo_url: url });
        toast('Photo updated');
        load();
      } catch (err) {
        toastError(err);
      }
    },
  }));

  await load();
}
