/* ==========================================================================
   Gallery — upload, caption, reorder, hide, preview, delete.
   ========================================================================== */

import { icon } from '../icons.js';
import {
  el, esc, safeUrl, emptyState, formDialog, confirmDialog, toast, toastError,
  makeSortable, pickFile, fileToDataUrl,
} from '../ui.js';
import { panel } from './common.js';

export async function render({ view, actions, ctx, setTitle }) {
  setTitle('Gallery', 'The pictures on the website, in the order they appear.');

  actions.append(el('button', {
    class: 'btn btn--ghost btn--sm', type: 'button',
    html: `${icon('plus', { size: 16 })}Add by URL`,
    onclick: () => addByUrl(),
  }), el('button', {
    class: 'btn btn--primary btn--sm', type: 'button',
    html: `${icon('upload', { size: 16 })}Upload`,
    onclick: () => upload(),
  }));

  const drop = el('div', {
    class: 'dropzone',
    html: `${icon('upload', { size: 30 })}
      <div><strong>Drop images here</strong>
      <p class="dim" style="font-size:.85rem">or use Upload above. They are resized before saving.</p></div>`,
  });

  const grid = el('div', { class: 'media-grid' });
  const order = el('div', { class: 'sortable' });

  view.append(panel({
    title: 'Images',
    subtitle: 'Each tile carries preview, hide, edit and delete.',
    body: el('div', {}, drop, el('div', { style: 'height:var(--space-5)' }), grid),
  }));
  view.append(panel({
    title: 'Order',
    subtitle: 'Drag the handles, or focus one and use the arrow keys.',
    body: order,
  }));

  wireDrop();

  async function load() {
    const items = await ctx.api.gallery.list({ all: true });

    if (!items.length) {
      grid.innerHTML = emptyState({
        iconName: 'image', title: 'No images yet',
        text: 'Upload a few and the gallery section appears on the website.',
      });
      order.innerHTML = '';
      return;
    }

    grid.innerHTML = '';
    for (const g of items) {
      const src = safeUrl(g.image_url);
      grid.append(el('figure', {
        class: 'media-tile',
        ...(g.is_visible ? {} : { 'data-hidden': '' }),
      },
      el('img', { src, alt: g.alt_text || g.caption || '', loading: 'lazy' }),
      el('figcaption', {},
        g.is_visible ? null : el('span', { class: 'badge', text: 'Hidden' }),
        el('span', { text: g.caption || 'No caption' })),
      el('div', { class: 'media-actions' },
        el('button', {
          class: 'btn btn--icon btn--sm', type: 'button', 'aria-label': 'Preview',
          html: icon('eye', { size: 15 }), onclick: () => preview(g),
        }),
        el('button', {
          class: 'btn btn--icon btn--sm', type: 'button',
          'aria-label': g.is_visible ? 'Hide from the website' : 'Show on the website',
          html: icon(g.is_visible ? 'ban' : 'check', { size: 15 }),
          onclick: () => toggle(g),
        }),
        el('button', {
          class: 'btn btn--icon btn--sm', type: 'button', 'aria-label': 'Edit caption',
          html: icon('pencil', { size: 15 }), onclick: () => editCaption(g),
        }),
        el('button', {
          class: 'btn btn--icon btn--sm', type: 'button', 'aria-label': 'Delete',
          html: icon('trash', { size: 15 }), onclick: () => remove(g),
        }))));
    }

    order.innerHTML = '';
    for (const g of items) {
      order.append(el('div', { class: 'sort-row', dataset: { id: g.id } },
        el('button', {
          class: 'drag-handle', type: 'button', 'data-drag-handle': '',
          'aria-label': `Reorder ${g.caption || 'image'}. Use the arrow keys.`,
          html: icon('grip', { size: 17 }),
        }),
        el('img', { class: 'sort-thumb', src: safeUrl(g.image_url), alt: '' }),
        el('div', { class: 'sort-main' },
          el('strong', { text: g.caption || 'No caption' }),
          el('span', { text: g.is_visible ? 'Visible' : 'Hidden' }))));
    }
  }

  makeSortable(order, async (ids) => {
    try {
      await ctx.api.gallery.reorder(ids);
      toast('Order saved');
      load();
    } catch (err) {
      toastError(err);
      load();
    }
  });

  function wireDrop() {
    for (const type of ['dragenter', 'dragover']) {
      drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add('is-over'); });
    }
    for (const type of ['dragleave', 'drop']) {
      drop.addEventListener(type, () => drop.classList.remove('is-over'));
    }
    drop.addEventListener('drop', async (e) => {
      e.preventDefault();
      const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
      if (files.length) await store(files);
    });
    drop.addEventListener('click', () => upload());
  }

  async function upload() {
    const file = await pickFile('image/*');
    if (file) await store([file]);
  }

  async function store(files) {
    const dismiss = toast(`Uploading ${files.length} image${files.length === 1 ? '' : 's'}…`,
      { type: 'info', timeout: 0 });
    try {
      for (const file of files) {
        const dataUrl = await fileToDataUrl(file, 1600, 0.84);
        const url = await ctx.api.storage.upload(dataUrl, 'gallery');
        await ctx.api.gallery.create({
          image_url: url,
          caption: '',
          alt_text: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
        });
      }
      dismiss();
      toast(`${files.length} image${files.length === 1 ? '' : 's'} added`);
      load();
    } catch (err) {
      dismiss();
      toastError(err);
    }
  }

  async function addByUrl() {
    const values = await formDialog({
      title: 'Add an image by URL',
      subtitle: 'Useful when the photos already live somewhere else.',
      iconName: 'image',
      submitLabel: 'Add image',
      fields: [
        { name: 'image_url', label: 'Image URL', required: true, placeholder: 'https://…' },
        { name: 'caption', label: 'Caption', placeholder: 'Chair one, Thursday evening' },
        { name: 'alt_text', label: 'Alt text',
          hint: 'What the picture shows, for anyone using a screen reader.' },
      ],
      onSubmit: async (v) => {
        if (!safeUrl(v.image_url)) throw new Error('That does not look like an image URL.');
        return ctx.api.gallery.create(v);
      },
    });
    if (values) { toast('Image added'); load(); }
  }

  async function editCaption(g) {
    const values = await formDialog({
      title: 'Edit image',
      iconName: 'pencil',
      submitLabel: 'Save',
      fields: [
        { name: 'caption', label: 'Caption', value: g.caption },
        { name: 'alt_text', label: 'Alt text', value: g.alt_text },
        { name: 'is_visible', type: 'switch', label: 'Show on the website', value: g.is_visible },
      ],
      onSubmit: (v) => ctx.api.gallery.update(g.id, v),
    });
    if (values) { toast('Image updated'); load(); }
  }

  async function toggle(g) {
    try {
      await ctx.api.gallery.update(g.id, { is_visible: !g.is_visible });
      toast(g.is_visible ? 'Hidden from the website' : 'Visible on the website');
      load();
    } catch (err) {
      toastError(err);
    }
  }

  async function remove(g) {
    const ok = await confirmDialog({
      title: 'Delete this image?',
      body: 'It disappears from the website immediately.',
      confirmLabel: 'Delete', danger: true,
    });
    if (!ok) return;
    try {
      await ctx.api.gallery.remove(g.id);
      toast('Image deleted');
      load();
    } catch (err) {
      toastError(err);
    }
  }

  function preview(g) {
    const dlg = el('dialog', { class: 'modal lightbox' },
      el('div', { class: 'modal-body', style: 'padding:16px' },
        el('img', { src: safeUrl(g.image_url), alt: g.alt_text || '' }),
        el('p', { class: 'muted', style: 'margin-top:12px', text: g.caption || '' })),
      el('div', { class: 'modal-foot' },
        el('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Close',
          onclick: () => dlg.close() })));
    document.body.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.showModal();
  }

  await load();
  void esc;
}
