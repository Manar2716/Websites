/* ==========================================================================
   Testimonials — what appears in the "what people say" section.
   ========================================================================== */

import { icon } from '../icons.js';
import {
  el, esc, emptyState, formDialog, confirmDialog, toast, toastError, makeSortable,
} from '../ui.js';
import { panel } from './common.js';

export async function render({ view, actions, ctx, setTitle }) {
  setTitle('Testimonials', 'Quotes from customers, in the order they appear.');

  actions.append(el('button', {
    class: 'btn btn--primary btn--sm', type: 'button',
    html: `${icon('plus', { size: 16 })}Add testimonial`,
    onclick: () => edit(null),
  }));

  const list = el('div', { class: 'sortable' });
  view.append(panel({
    title: 'Published and drafts',
    subtitle: 'Only published ones reach the website. Drag to reorder.',
    body: list,
  }));

  async function load() {
    const reviews = await ctx.api.reviews.list({ all: true });

    if (!reviews.length) {
      list.innerHTML = emptyState({
        iconName: 'quote', title: 'No testimonials yet',
        text: 'Add one and the section appears on the website. With none, it stays hidden.',
      });
      return;
    }

    list.innerHTML = '';
    for (const r of reviews) {
      list.append(el('div', { class: 'sort-row', dataset: { id: r.id }, style: 'align-items:flex-start' },
        el('button', {
          class: 'drag-handle', type: 'button', 'data-drag-handle': '',
          'aria-label': `Reorder the quote from ${r.author_name}. Use the arrow keys.`,
          html: icon('grip', { size: 17 }),
        }),
        el('div', { class: 'sort-main' },
          el('div', {
            class: 'stars',
            style: 'margin-bottom:6px',
            html: icon('star').repeat(Math.max(1, Math.min(5, r.rating))),
          }),
          el('strong', { text: `“${r.body}”`, style: 'font-weight:450;font-size:.92rem' }),
          el('span', { text: `${r.author_name}${r.author_role ? ` · ${r.author_role}` : ''}` })),
        el('div', { class: 'sort-side' },
          el('span', { html: r.is_published
            ? '<span class="badge badge--ok">Live</span>'
            : '<span class="badge">Draft</span>' }),
          el('label', { class: 'switch', title: r.is_published ? 'Unpublish' : 'Publish' },
            el('input', {
              type: 'checkbox', checked: r.is_published,
              'aria-label': `${r.is_published ? 'Unpublish' : 'Publish'} the quote from ${r.author_name}`,
              onchange: (e) => publish(r, e.target.checked),
            }),
            el('span', { class: 'switch-track' })),
          el('button', {
            class: 'btn btn--icon btn--quiet btn--sm', type: 'button', 'aria-label': 'Edit',
            html: icon('pencil', { size: 16 }), onclick: () => edit(r),
          }),
          el('button', {
            class: 'btn btn--icon btn--quiet btn--sm', type: 'button', 'aria-label': 'Delete',
            html: icon('trash', { size: 16 }), onclick: () => remove(r),
          }))));
    }
  }

  makeSortable(list, async (ids) => {
    try {
      await ctx.api.reviews.reorder(ids);
      toast('Order saved');
    } catch (err) {
      toastError(err);
      load();
    }
  });

  async function publish(review, isPublished) {
    try {
      await ctx.api.reviews.update(review.id, { is_published: isPublished });
      toast(isPublished ? 'Published' : 'Unpublished');
    } catch (err) {
      toastError(err);
    }
    load();
  }

  async function edit(review) {
    const barbers = await ctx.api.barbers.list({ all: true });
    const values = await formDialog({
      title: review ? 'Edit testimonial' : 'Add a testimonial',
      subtitle: 'Use the customer’s own words. Initials are fine for a surname.',
      iconName: review ? 'pencil' : 'quote',
      submitLabel: review ? 'Save' : 'Add',
      wide: true,
      fields: [
        {
          type: 'group',
          fields: [
            { name: 'author_name', label: 'Name', required: true,
              value: review?.author_name || '', placeholder: 'Daniel W.' },
            { name: 'author_role', label: 'Context', value: review?.author_role || '',
              placeholder: 'Customer since 2019' },
          ],
        },
        { name: 'body', label: 'What they said', type: 'textarea', rows: 4, required: true,
          value: review?.body || '' },
        {
          type: 'group',
          fields: [
            { name: 'rating', label: 'Stars', type: 'select', value: String(review?.rating ?? 5),
              options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n === 1 ? '' : 's'}` })) },
            { name: 'barber_id', label: 'About which barber', type: 'select',
              value: review?.barber_id || '',
              options: [{ value: '', label: 'The shop generally' },
                ...barbers.map((b) => ({ value: b.id, label: b.name }))] },
          ],
        },
        { name: 'is_published', type: 'switch', label: 'Publish on the website',
          value: review?.is_published ?? true },
      ],
      onSubmit: (v) => {
        const payload = {
          author_name: v.author_name,
          author_role: v.author_role,
          body: v.body,
          rating: Number(v.rating),
          barber_id: v.barber_id || null,
          is_published: v.is_published,
        };
        return review
          ? ctx.api.reviews.update(review.id, payload)
          : ctx.api.reviews.create(payload);
      },
    });

    if (values) {
      toast(review ? 'Testimonial updated' : 'Testimonial added');
      load();
    }
  }

  async function remove(review) {
    const ok = await confirmDialog({
      title: `Delete the quote from ${review.author_name}?`,
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    try {
      await ctx.api.reviews.remove(review.id);
      toast('Testimonial deleted');
    } catch (err) {
      toastError(err);
    }
    load();
  }

  await load();
  void esc;
}
