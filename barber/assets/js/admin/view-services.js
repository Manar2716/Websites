/* ==========================================================================
   Services — price, length, description, enable/disable, drag ordering.
   ========================================================================== */

import { icon, iconNames } from '../icons.js';
import {
  el, esc, money, emptyState, formDialog, confirmDialog, toast, toastError, makeSortable,
} from '../ui.js';
import { fmtDuration } from '../time.js';
import { panel } from './common.js';

const ICON_CHOICES = ['scissors', 'razor', 'beard', 'fade', 'child', 'star', 'clock', 'sparkle', 'user']
  .filter((n) => iconNames.includes(n));

export async function render({ view, actions, ctx, setTitle }) {
  setTitle('Services', 'The menu customers book from. Drag to reorder.');

  actions.append(el('button', {
    class: 'btn btn--primary btn--sm', type: 'button',
    html: `${icon('plus', { size: 16 })}Add service`,
    onclick: () => edit(null),
  }));

  const list = el('div', { class: 'sortable' });
  view.append(panel({
    title: 'Menu',
    subtitle: 'The order here is the order on the website.',
    body: list,
  }));

  async function load() {
    const services = await ctx.api.services.list({ all: true });

    if (!services.length) {
      list.innerHTML = emptyState({
        iconName: 'scissors',
        title: 'No services yet',
        text: 'Add the first one and it appears on the website immediately.',
      });
      return;
    }

    list.innerHTML = '';
    for (const s of services) {
      list.append(el('div', { class: 'sort-row', dataset: { id: s.id } },
        el('button', {
          class: 'drag-handle', type: 'button', 'data-drag-handle': '',
          'aria-label': `Reorder ${s.name}. Use the arrow keys.`,
          html: icon('grip', { size: 17 }),
        }),
        el('span', { class: 'service-icon', style: 'width:38px;height:38px;border-radius:11px',
          html: icon(s.icon || 'scissors', { size: 18 }) }),
        el('div', { class: 'sort-main' },
          el('strong', { text: s.name }),
          el('span', { text: `${fmtDuration(s.duration_minutes)} · ${money(s.price_cents)}${s.is_featured ? ' · featured' : ''}` })),
        el('div', { class: 'sort-side' },
          el('span', { html: s.is_active
            ? '<span class="badge badge--ok">Live</span>'
            : '<span class="badge">Hidden</span>' }),
          el('label', { class: 'switch', title: s.is_active ? 'Disable' : 'Enable' },
            el('input', {
              type: 'checkbox', checked: s.is_active,
              'aria-label': `${s.is_active ? 'Disable' : 'Enable'} ${s.name}`,
              onchange: (e) => toggle(s, e.target.checked),
            }),
            el('span', { class: 'switch-track' })),
          el('button', {
            class: 'btn btn--icon btn--quiet btn--sm', type: 'button', 'aria-label': `Edit ${s.name}`,
            html: icon('pencil', { size: 16 }), onclick: () => edit(s),
          }),
          el('button', {
            class: 'btn btn--icon btn--quiet btn--sm', type: 'button', 'aria-label': `Delete ${s.name}`,
            html: icon('trash', { size: 16 }), onclick: () => remove(s),
          }))));
    }
  }

  makeSortable(list, async (ids) => {
    try {
      await ctx.api.services.reorder(ids);
      toast('Order saved');
    } catch (err) {
      toastError(err);
      load();
    }
  });

  async function toggle(service, isActive) {
    try {
      await ctx.api.services.update(service.id, { is_active: isActive });
      toast(isActive ? `${service.name} is live` : `${service.name} is hidden`, {
        text: isActive ? 'Customers can book it again.' : 'Existing appointments are unaffected.',
      });
    } catch (err) {
      toastError(err);
    }
    load();
  }

  async function edit(service) {
    const values = await formDialog({
      title: service ? `Edit ${service.name}` : 'Add a service',
      subtitle: 'Length decides how much of the diary the appointment takes up.',
      iconName: service ? 'pencil' : 'plus',
      submitLabel: service ? 'Save' : 'Add service',
      wide: true,
      fields: [
        { name: 'name', label: 'Name', required: true, value: service?.name || '',
          placeholder: 'Skin Fade' },
        { name: 'description', label: 'Description', type: 'textarea', rows: 3,
          value: service?.description || '',
          placeholder: 'What the customer actually gets. One or two sentences.' },
        {
          type: 'group',
          fields: [
            { name: 'price', label: `Price (${ctx.settings.currency})`, type: 'number',
              required: true, min: 0, step: '0.5',
              value: service ? (service.price_cents / 100).toFixed(2) : '' },
            { name: 'duration_minutes', label: 'Length (minutes)', type: 'number',
              required: true, min: 5, max: 480, step: 5,
              value: service?.duration_minutes ?? ctx.settings.default_duration_minutes },
          ],
        },
        { name: 'icon', label: 'Icon', type: 'select', value: service?.icon || 'scissors',
          options: ICON_CHOICES.map((n) => ({ value: n, label: n })) },
        { name: 'is_featured', type: 'switch', label: 'Show a "Popular" flag',
          value: service?.is_featured ?? false,
          hint: 'Featured services are also what the homepage offers times for.' },
        { name: 'is_active', type: 'switch', label: 'Bookable',
          value: service?.is_active ?? true,
          hint: 'Turn off to take it off the website without losing its history.' },
      ],
      onSubmit: async (v) => {
        const payload = {
          name: v.name,
          description: v.description,
          price_cents: Math.round(Number(v.price) * 100),
          duration_minutes: Number(v.duration_minutes),
          icon: v.icon,
          is_featured: v.is_featured,
          is_active: v.is_active,
        };
        if (service) return ctx.api.services.update(service.id, payload);
        return ctx.api.services.create({
          ...payload,
          slug: slugify(v.name),
        });
      },
    });

    if (values) {
      toast(service ? 'Service updated' : 'Service added');
      load();
    }
  }

  async function remove(service) {
    const ok = await confirmDialog({
      title: `Delete ${service.name}?`,
      body: 'If it has ever been booked, disable it instead — deleting would break that history.',
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    try {
      await ctx.api.services.remove(service.id);
      toast('Service deleted');
    } catch (err) {
      toastError(err);
    }
    load();
  }

  await load();
}

function slugify(name) {
  return String(name).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 60) || `service-${Date.now()}`;
}
