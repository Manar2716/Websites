/* ==========================================================================
   Website content — every string on the public site, editable here.

   The schema is declared once below; each entry becomes a form and saves back
   into a single jsonb row. Adding a field to the site means adding a line
   here, not a migration.
   ========================================================================== */

import { icon } from '../icons.js';
import { el, esc, toast, toastError, confirmDialog } from '../ui.js';
import { getContext } from '../api.js';
import { panel } from './common.js';

const SECTIONS = [
  {
    key: 'business', title: 'Business', iconName: 'star',
    hint: 'The name and mark used in the header, the footer and the browser tab.',
    fields: [
      { name: 'name', label: 'Business name' },
      { name: 'tagline', label: 'Tagline', hint: 'Sits under the name in the header.' },
      { name: 'logo_mark', label: 'Logo letter', hint: 'One or two characters.' },
    ],
  },
  {
    key: 'hero', title: 'Hero', iconName: 'sparkle',
    hint: 'The first screen. The three figures are free text — write "12k+" if you like.',
    fields: [
      { name: 'eyebrow', label: 'Small line above the title' },
      { name: 'title', label: 'Headline', type: 'textarea', rows: 2 },
      { name: 'subtitle', label: 'Sub-headline', type: 'textarea', rows: 2 },
      { name: 'primary_cta', label: 'Main button' },
      { name: 'secondary_cta', label: 'Second button' },
      { name: 'stat_one_value', label: 'Figure 1' },
      { name: 'stat_one_label', label: 'Figure 1 label' },
      { name: 'stat_two_value', label: 'Figure 2' },
      { name: 'stat_two_label', label: 'Figure 2 label' },
      { name: 'stat_three_value', label: 'Figure 3' },
      { name: 'stat_three_label', label: 'Figure 3 label' },
    ],
  },
  {
    key: 'about', title: 'About', iconName: 'note',
    hint: 'Leave a blank line between paragraphs.',
    fields: [
      { name: 'title', label: 'Heading' },
      { name: 'body', label: 'Body', type: 'textarea', rows: 8, wide: true },
      { name: 'quote', label: 'Pull quote', type: 'textarea', rows: 3, wide: true },
      { name: 'quote_author', label: 'Quote attribution' },
    ],
  },
  {
    key: 'contact', title: 'Contact and map', iconName: 'pin',
    hint: 'Coordinates drive the map. Leave them empty to show the address on its own.',
    fields: [
      { name: 'title', label: 'Heading' },
      { name: 'subtitle', label: 'Sub-heading' },
      { name: 'address_line1', label: 'Address line 1' },
      { name: 'address_line2', label: 'Address line 2' },
      { name: 'phone', label: 'Phone' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'map_lat', label: 'Latitude', type: 'number', step: 'any' },
      { name: 'map_lng', label: 'Longitude', type: 'number', step: 'any' },
      { name: 'map_query', label: 'Search text for map links', wide: true },
      { name: 'directions_note', label: 'Getting here', type: 'textarea', rows: 3, wide: true },
    ],
  },
  {
    key: 'social', title: 'Social links', iconName: 'instagram',
    hint: 'Full URLs. Empty ones are simply not shown.',
    fields: [
      { name: 'instagram', label: 'Instagram URL' },
      { name: 'facebook', label: 'Facebook URL' },
      { name: 'tiktok', label: 'TikTok URL' },
      { name: 'whatsapp', label: 'WhatsApp URL' },
    ],
  },
  {
    key: 'footer', title: 'Footer', iconName: 'layers',
    fields: [
      { name: 'blurb', label: 'Footer blurb', type: 'textarea', rows: 2, wide: true },
      { name: 'note', label: 'Small note' },
      { name: 'legal', label: 'Copyright line' },
    ],
  },
];

export async function render({ view, ctx, setTitle }) {
  setTitle('Website content', 'Everything the site says, without touching code.');

  const content = await ctx.api.content.all();

  for (const s of SECTIONS) {
    view.append(sectionPanel(s, content[s.key] || {}, ctx));
  }
  view.append(faqPanel(content.faq?.items || [], ctx));
}

/* ---------------------------------------------------------------- panels -- */

function sectionPanel(schema, value, ctx) {
  // The submit button lives inside the form — a type="submit" outside one is
  // inert, which is exactly the sort of thing that silently loses an edit.
  const form = el('form', { novalidate: true });
  const grid = el('div', { class: 'editor-grid' });
  form.append(grid);

  for (const f of schema.fields) {
    const id = `c_${schema.key}_${f.name}`;
    const control = f.type === 'textarea'
      ? `<textarea class="textarea" id="${id}" name="${f.name}" rows="${f.rows || 3}">${esc(value[f.name] ?? '')}</textarea>`
      : `<input class="input" id="${id}" name="${f.name}" type="${f.type || 'text'}"
          ${f.step ? `step="${f.step}"` : ''} value="${esc(value[f.name] ?? '')}">`;
    grid.append(el('div', {
      class: `field ${f.wide ? 'field--wide' : ''}`,
      html: `<label for="${id}">${esc(f.label)}</label>${control}
        ${f.hint ? `<p class="field-hint">${esc(f.hint)}</p>` : ''}`,
    }));
  }

  const status = el('span', { class: 'dim' });
  const save = el('button', { class: 'btn btn--primary btn--sm', type: 'submit', text: 'Save section' });
  form.append(el('div', { class: 'editor-foot' }, status, save));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    save.classList.add('is-busy');
    try {
      const next = {};
      for (const f of schema.fields) {
        const raw = form.elements[f.name].value.trim();
        next[f.name] = f.type === 'number' ? (raw === '' ? null : Number(raw)) : raw;
      }
      await ctx.api.content.set(schema.key, next);
      await getContext({ refresh: true });
      status.textContent = 'Saved just now';
      toast(`${schema.title} saved`, { text: 'The website is already showing it.' });
    } catch (err) {
      toastError(err);
    } finally {
      save.classList.remove('is-busy');
    }
  });

  // Submit the section the field belongs to on ⌘/Ctrl+Enter.
  form.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') form.requestSubmit();
  });

  return panel({ title: schema.title, subtitle: schema.hint || '', body: form });
}

/* ------------------------------------------------------------------- faq -- */

function faqPanel(initialItems, ctx) {
  let items = initialItems.map((i) => ({ ...i }));
  const list = el('div', { class: 'sortable' });

  const draw = () => {
    list.innerHTML = '';
    if (!items.length) {
      list.append(el('p', { class: 'dim', style: 'font-size:.9rem', text: 'No questions yet.' }));
    }
    items.forEach((item, index) => {
      list.append(el('div', { class: 'sort-row', style: 'align-items:flex-start' },
        el('div', { class: 'sort-main', style: 'display:grid;gap:var(--space-3)' },
          el('input', {
            class: 'input', value: item.q, placeholder: 'Do you take walk-ins?',
            'aria-label': `Question ${index + 1}`,
            oninput: (e) => { items[index].q = e.target.value; },
          }),
          el('textarea', {
            class: 'textarea', rows: 2, placeholder: 'The answer, in the shop’s voice.',
            'aria-label': `Answer ${index + 1}`,
            oninput: (e) => { items[index].a = e.target.value; },
          }, item.a)),
        el('div', { class: 'sort-side', style: 'flex-direction:column' },
          el('button', {
            class: 'btn btn--icon btn--quiet btn--sm', type: 'button', 'aria-label': 'Move up',
            html: icon('chevronUp', { size: 16 }),
            disabled: index === 0,
            onclick: () => { swap(index, index - 1); },
          }),
          el('button', {
            class: 'btn btn--icon btn--quiet btn--sm', type: 'button', 'aria-label': 'Move down',
            html: icon('chevronDown', { size: 16 }),
            disabled: index === items.length - 1,
            onclick: () => { swap(index, index + 1); },
          }),
          el('button', {
            class: 'btn btn--icon btn--quiet btn--sm', type: 'button', 'aria-label': 'Remove question',
            html: icon('trash', { size: 16 }),
            onclick: async () => {
              const ok = await confirmDialog({
                title: 'Remove this question?', confirmLabel: 'Remove', danger: true,
              });
              if (!ok) return;
              items.splice(index, 1);
              draw();
            },
          }))));
    });
  };

  const swap = (a, b) => {
    [items[a], items[b]] = [items[b], items[a]];
    draw();
  };

  const save = el('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Save FAQ' });
  save.onclick = async () => {
    save.classList.add('is-busy');
    try {
      const clean = items
        .map((i) => ({ q: i.q.trim(), a: i.a.trim() }))
        .filter((i) => i.q && i.a);
      await ctx.api.content.set('faq', { items: clean });
      await getContext({ refresh: true });
      items = clean.map((i) => ({ ...i }));
      draw();
      toast('FAQ saved', { text: `${clean.length} question${clean.length === 1 ? '' : 's'} live.` });
    } catch (err) {
      toastError(err);
    } finally {
      save.classList.remove('is-busy');
    }
  };

  const add = el('button', {
    class: 'btn btn--ghost btn--sm', type: 'button',
    html: `${icon('plus', { size: 16 })}Add question`,
    onclick: () => { items.push({ q: '', a: '' }); draw(); },
  });

  draw();

  return panel({
    title: 'FAQ',
    subtitle: 'Shown on the website in this order. Empty rows are dropped when you save.',
    actions: add,
    body: el('div', {}, list, el('div', { class: 'editor-foot' }, save)),
  });
}
