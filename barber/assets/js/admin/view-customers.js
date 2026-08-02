/* ==========================================================================
   Customers — the shop's address book, built from bookings rather than
   sign-ups. Nobody ever creates an account.
   ========================================================================== */

import {
  el, esc, money, initials, emptyState, skeletonRows, debounce,
  formDialog, confirmDialog, toast, toastError,
} from '../ui.js';
import { fmtDate, fmtRelative, fmtTime } from '../time.js';
import { panel, searchBox, toolbar, statusBadge, rowMenu, personCell } from './common.js';

export async function render({ view, ctx, setTitle }) {
  setTitle('Customers', 'Everyone who has ever sat in a chair.');

  const body = el('div', { class: 'panel-body panel-body--flush' });
  const search = searchBox('Search by name, phone or email…',
    debounce((value) => load(value), 240));

  const board = panel({
    title: 'Address book',
    actions: toolbar(search),
    flush: true,
    body,
  });
  view.append(board);

  async function load(term = '') {
    body.innerHTML = skeletonRows(6);
    try {
      const rows = await ctx.api.customers.list({ search: term });
      draw(rows);
    } catch (err) {
      toastError(err);
      body.innerHTML = emptyState({ iconName: 'alert', title: 'Could not load customers' });
    }
  }

  function draw(rows) {
    if (!rows.length) {
      body.innerHTML = emptyState({
        iconName: 'users',
        title: 'Nobody here',
        text: 'Customers are created automatically the first time someone books.',
      });
      return;
    }

    const table = el('table', { class: 'data' },
      el('thead', {}, el('tr', {},
        el('th', {}, 'Customer'),
        el('th', {}, 'Contact'),
        el('th', {}, 'Regular with'),
        el('th', { class: 'num' }, 'Visits'),
        el('th', { class: 'num' }, 'Spend'),
        el('th', {}, 'Last seen'),
        el('th', {}))));

    const tbody = el('tbody');
    for (const c of rows) {
      tbody.append(el('tr', {},
        el('td', { html: personCell(c, c.notes ? 'Has a note' : '') }),
        el('td', { html: `${esc(c.phone)}
          <span class="dim" style="display:block;font-size:.78rem">${esc(c.email || '')}</span>` }),
        el('td', { text: c.favorite_barber?.name || '—' }),
        el('td', { class: 'num', text: String(c.visit_count) }),
        el('td', { class: 'num', text: money(c.total_spend_cents) }),
        el('td', { text: c.last_visit_at ? fmtRelative(c.last_visit_at) : 'Never' }),
        el('td', { class: 'actions' },
          el('button', {
            class: 'btn btn--ghost btn--sm', type: 'button', text: 'Open',
            onclick: () => detail(c.id),
          }),
          rowMenu([
            { label: 'Edit details', icon: 'pencil', onSelect: () => edit(c) },
            { label: 'Add a note', icon: 'note', onSelect: () => edit(c, true) },
            '-',
            { label: 'Delete customer', icon: 'trash', danger: true, onSelect: () => remove(c) },
          ]))));
    }

    table.append(tbody);
    body.innerHTML = '';
    body.append(el('div', { class: 'table-wrap' }, table));
  }

  async function detail(id) {
    const c = await ctx.api.customers.get(id);
    if (!c) return;

    const history = (c.history || []);
    const dlg = el('dialog', { class: 'modal modal--wide' },
      el('div', { class: 'modal-head' },
        el('span', {
          class: 'avatar', style: '--avatar:46px;margin:0',
          text: initials(c.name),
        }),
        el('div', {},
          el('h3', { text: c.name }),
          el('p', { text: `${c.phone}${c.email ? ` · ${c.email}` : ''}` }))),
      el('div', { class: 'modal-body' },
        el('div', {
          class: 'stat-grid',
          style: '--space-4:12px;margin-bottom:var(--space-5)',
          html: `
            ${miniStat('Visits', String(c.visit_count))}
            ${miniStat('Lifetime spend', money(c.total_spend_cents))}
            ${miniStat('Regular with', c.favorite_barber?.name || '—')}
            ${miniStat('Last seen', c.last_visit_at ? fmtDate(c.last_visit_at, ctx.tz, 'medium') : 'Never')}`,
        }),
        c.notes
          ? el('p', {
            style: 'padding:12px 14px;border-radius:var(--radius-sm);background:var(--warn-soft);'
              + 'font-size:.9rem;margin-bottom:var(--space-5)',
            text: c.notes,
          })
          : null,
        el('h4', { style: 'margin-bottom:var(--space-3)', text: 'Appointment history' }),
        history.length
          ? el('div', { class: 'agenda', style: 'border:1px solid var(--line);border-radius:var(--radius-md)' },
            ...history.slice(0, 30).map((a) => el('div', { class: 'agenda-item' },
              el('div', { class: 'agenda-time',
                html: `${esc(fmtDate(a.starts_at, ctx.tz, 'short'))}
                  <span>${esc(fmtTime(a.starts_at, ctx.tz))}</span>` }),
              el('div', { class: 'agenda-main' },
                el('strong', { text: a.service?.name || '—' }),
                el('span', { text: `${a.barber?.name || '—'} · ${money(a.price_cents)}` })),
              el('span', { html: statusBadge(a.status) }))))
          : el('p', { class: 'dim', style: 'font-size:.9rem', text: 'No appointments yet.' })),
      el('div', { class: 'modal-foot' },
        el('button', { class: 'btn btn--ghost', type: 'button', text: 'Edit details',
          onclick: () => { dlg.close(); edit(c); } }),
        el('button', { class: 'btn btn--primary', type: 'button', text: 'Close',
          onclick: () => dlg.close() })));

    document.body.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.showModal();
  }

  async function edit(customer, focusNotes = false) {
    const barbers = await ctx.api.barbers.list({ all: true });
    const values = await formDialog({
      title: focusNotes ? `Note about ${customer.name}` : `Edit ${customer.name}`,
      subtitle: 'Notes are private to the shop — the customer never sees them.',
      iconName: focusNotes ? 'note' : 'pencil',
      submitLabel: 'Save',
      wide: true,
      fields: [
        {
          type: 'group',
          fields: [
            { name: 'name', label: 'Name', required: true, value: customer.name },
            { name: 'phone', label: 'Phone', required: true, value: customer.phone },
          ],
        },
        { name: 'email', label: 'Email', type: 'email', value: customer.email || '' },
        { name: 'favorite_barber_id', label: 'Regular barber', type: 'select',
          value: customer.favorite_barber_id || '',
          options: [{ value: '', label: 'No preference' },
            ...barbers.map((b) => ({ value: b.id, label: b.name }))] },
        { name: 'notes', label: 'Private note', type: 'textarea', rows: 4,
          value: customer.notes || '',
          placeholder: 'Scissors only on top. Allergic to the sandalwood tonic.' },
      ],
      onSubmit: (v) => ctx.api.customers.update(customer.id, {
        name: v.name,
        phone: v.phone,
        email: v.email || null,
        favorite_barber_id: v.favorite_barber_id || null,
        notes: v.notes,
      }),
    });

    if (values) {
      toast('Customer saved');
      load(search.querySelector('input').value);
    }
  }

  async function remove(customer) {
    const ok = await confirmDialog({
      title: `Delete ${customer.name}?`,
      body: 'Their appointment history goes with them. This cannot be undone.',
      confirmLabel: 'Delete customer', danger: true,
    });
    if (!ok) return;
    try {
      await ctx.api.customers.remove(customer.id);
      toast('Customer deleted');
    } catch (err) {
      toastError(err);
    }
    load(search.querySelector('input').value);
  }

  await load();
}

function miniStat(label, value) {
  return `<div class="glass stat" style="padding:var(--space-4)">
    <span class="stat-label">${esc(label)}</span>
    <span class="stat-value" style="font-size:1.35rem">${esc(value)}</span></div>`;
}
