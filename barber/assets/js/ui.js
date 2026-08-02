/* ==========================================================================
   UI kit — DOM helpers, theme, toasts, dialogs, reveals.
   Shared by the public site and the admin so both behave identically.
   ========================================================================== */

import { icon } from './icons.js';

/* ------------------------------------------------------------------ dom -- */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Escape for interpolation into an HTML template. Used on every DB value. */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Escape for a `url()` / src attribute: strips anything that is not an
 *  http(s), data:image or relative reference. Gallery URLs are admin input,
 *  but a stored `javascript:` URL should still be inert. */
export function safeUrl(value) {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (/^(https?:|data:image\/|\/|\.{0,2}\/)/i.test(v)) return v;
  return '';
}

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function frag(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content;
}

export function debounce(fn, ms = 260) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function initials(name) {
  return String(name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join('');
}

/* ---------------------------------------------------------------- money -- */

let moneyFmt = null;
let moneyLocaleKey = '';

export function configureMoney(currency = 'EUR') {
  const key = currency;
  if (key === moneyLocaleKey) return;
  moneyLocaleKey = key;
  try {
    moneyFmt = new Intl.NumberFormat(undefined, {
      style: 'currency', currency, maximumFractionDigits: 2,
    });
  } catch {
    moneyFmt = null;
  }
}

export function money(cents, { compact = false } = {}) {
  const value = (Number(cents) || 0) / 100;
  if (compact && Math.abs(value) >= 10000) {
    return (moneyFmt?.formatToParts(0).find((p) => p.type === 'currency')?.value ?? '')
      + `${(value / 1000).toFixed(1)}k`;
  }
  if (moneyFmt) {
    return Number.isInteger(value)
      ? moneyFmt.format(value).replace(/[.,]00(?!\d)/, '')
      : moneyFmt.format(value);
  }
  return value.toFixed(2);
}

/* ---------------------------------------------------------------- theme -- */

const THEME_KEY = 'fadeco.theme';

export function currentTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#0b0b0d' : '#f2f1ee');
  document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  syncThemeToggles();
}

function syncThemeToggles() {
  const dark = document.documentElement.dataset.theme === 'dark';
  for (const btn of $$('[data-theme-toggle]')) {
    btn.innerHTML = icon(dark ? 'sun' : 'moon', { size: 19 });
    btn.setAttribute('aria-label', dark ? 'Switch to light appearance' : 'Switch to dark appearance');
    btn.title = btn.getAttribute('aria-label');
  }
}

export function initTheme() {
  applyTheme(currentTheme());
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem(THEME_KEY)) applyTheme(e.matches ? 'dark' : 'light');
  });
}

/* --------------------------------------------------------------- toasts -- */

function toaster() {
  let node = $('.toaster');
  if (!node) {
    node = el('div', { class: 'toaster', role: 'status', 'aria-live': 'polite' });
    document.body.append(node);
  }
  return node;
}

const TOAST_ICON = { success: 'checkCircle', error: 'xCircle', info: 'info', warn: 'alert' };

export function toast(title, { text = '', type = 'success', timeout = 4200 } = {}) {
  const node = el('div', { class: `toast toast--${type}` },
    frag(icon(TOAST_ICON[type] || 'info', { size: 20, className: 'toast-icon' })),
    el('div', { class: 'toast-body' },
      el('div', { class: 'toast-title', text: title }),
      text ? el('div', { class: 'toast-text', text }) : null),
    el('button', {
      class: 'toast-close', type: 'button', 'aria-label': 'Dismiss',
      html: icon('x', { size: 15 }),
      onclick: () => dismiss(),
    }));

  let done = false;
  const dismiss = () => {
    if (done) return;
    done = true;
    node.classList.add('is-leaving');
    node.addEventListener('animationend', () => node.remove(), { once: true });
    setTimeout(() => node.remove(), 500);
  };

  toaster().append(node);
  if (timeout) setTimeout(dismiss, timeout);
  return dismiss;
}

/** Turns any thrown error into one honest sentence. */
export function errorMessage(err) {
  if (!err) return 'Something went wrong.';
  const msg = err.message || err.error_description || err.hint || String(err);
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  if (/duplicate key|unique_violation|already been taken/i.test(msg)) {
    return 'That time has just been taken. Please pick another slot.';
  }
  if (/invalid login credentials/i.test(msg)) return 'That email and password do not match.';
  if (/jwt|not authenticated|permission denied|row-level security/i.test(msg)) {
    return 'Your session has expired. Please sign in again.';
  }
  return msg.replace(/^[A-Z_]+:\s*/, '');
}

export function toastError(err) {
  toast('That did not work', { text: errorMessage(err), type: 'error', timeout: 6500 });
}

/* -------------------------------------------------------------- dialogs -- */

function mountDialog(node) {
  document.body.append(node);
  node.addEventListener('close', () => node.remove());
  // Click on the backdrop (i.e. outside the panel) closes.
  node.addEventListener('click', (e) => {
    if (e.target === node) node.close('');
  });
  node.showModal();
  return node;
}

export function confirmDialog({
  title = 'Are you sure?',
  body = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  iconName = danger ? 'alert' : 'help',
} = {}) {
  return new Promise((resolve) => {
    const dlg = el('dialog', { class: 'modal' },
      el('div', { class: 'modal-head' },
        el('div', {
          class: 'modal-glyph',
          style: danger ? 'background:var(--danger-soft);color:var(--danger)' : '',
          html: icon(iconName, { size: 22 }),
        }),
        el('div', {}, el('h3', { text: title }), body ? el('p', { text: body }) : null)),
      el('div', { class: 'modal-foot' },
        el('button', { class: 'btn btn--ghost', type: 'button', text: cancelLabel,
          onclick: () => dlg.close('') }),
        el('button', {
          class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, type: 'button',
          text: confirmLabel, onclick: () => dlg.close('ok'),
        })));
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    mountDialog(dlg);
    dlg.querySelector('.btn--primary, .btn--danger')?.focus();
  });
}

/**
 * A form in a dialog. `fields` describe the inputs; resolves with the values
 * or null if dismissed. `onSubmit` may throw to keep the dialog open with an
 * error shown, which is how save failures are surfaced without losing input.
 */
export function formDialog({
  title, subtitle = '', fields = [], submitLabel = 'Save', wide = false,
  iconName = 'pencil', onSubmit = null,
} = {}) {
  return new Promise((resolve) => {
    const body = el('div', { class: 'modal-body' });
    const errorLine = el('p', { class: 'field-error', hidden: true });

    for (const f of fields) {
      body.append(renderField(f));
    }

    const form = el('form', { class: 'modal-form', novalidate: true },
      el('div', { class: 'modal-head' },
        el('div', { class: 'modal-glyph', html: icon(iconName, { size: 22 }) }),
        el('div', {}, el('h3', { text: title }), subtitle ? el('p', { text: subtitle }) : null)),
      body,
      el('div', { class: 'modal-foot' },
        errorLine,
        el('button', { class: 'btn btn--ghost', type: 'button', text: 'Cancel',
          onclick: () => dlg.close('') }),
        el('button', { class: 'btn btn--primary', type: 'submit', text: submitLabel })));

    const dlg = el('dialog', { class: `modal ${wide ? 'modal--wide' : ''}` }, form);
    let result = null;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submit = form.querySelector('button[type="submit"]');
      const values = readForm(form, fields);
      const invalid = validate(fields, values, form);
      if (invalid) return;

      if (onSubmit) {
        submit.classList.add('is-busy');
        errorLine.hidden = true;
        try {
          result = (await onSubmit(values)) ?? values;
          dlg.close('ok');
        } catch (err) {
          errorLine.textContent = errorMessage(err);
          errorLine.hidden = false;
        } finally {
          submit.classList.remove('is-busy');
        }
      } else {
        result = values;
        dlg.close('ok');
      }
    });

    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok' ? result : null), { once: true });
    mountDialog(dlg);
    body.querySelector('input,select,textarea')?.focus();
  });
}

function renderField(f) {
  if (f.type === 'hidden') return el('input', { type: 'hidden', name: f.name, value: f.value ?? '' });

  if (f.type === 'group') {
    return el('div', { class: 'field-row' }, ...f.fields.map(renderField));
  }

  if (f.type === 'switch') {
    return el('label', { class: 'switch field-switch' },
      el('input', { type: 'checkbox', name: f.name, checked: !!f.value }),
      el('span', { class: 'switch-track' }),
      el('span', {}, el('span', { class: 'label', text: f.label }),
        f.hint ? el('span', { class: 'field-hint', text: f.hint }) : null));
  }

  const id = `f_${f.name}_${Math.random().toString(36).slice(2, 7)}`;
  let control;
  if (f.type === 'select') {
    control = el('select', { class: 'select', name: f.name, id },
      ...(f.options || []).map((o) =>
        el('option', { value: o.value, selected: String(o.value) === String(f.value ?? '') },
          o.label)));
  } else if (f.type === 'textarea') {
    control = el('textarea', {
      class: 'textarea', name: f.name, id, rows: f.rows || 4,
      placeholder: f.placeholder || '',
    }, f.value ?? '');
  } else {
    control = el('input', {
      class: 'input', type: f.type || 'text', name: f.name, id,
      value: f.value ?? '', placeholder: f.placeholder || '',
      ...(f.min !== undefined ? { min: f.min } : {}),
      ...(f.max !== undefined ? { max: f.max } : {}),
      ...(f.step !== undefined ? { step: f.step } : {}),
      ...(f.autocomplete ? { autocomplete: f.autocomplete } : {}),
    });
  }

  return el('div', { class: `field ${f.wide ? 'field--wide' : ''}` },
    el('label', { for: id, text: f.label }),
    control,
    f.hint ? el('p', { class: 'field-hint', text: f.hint }) : null,
    el('p', { class: 'field-error', hidden: true, dataset: { errorFor: f.name } }));
}

function flatFields(fields) {
  return fields.flatMap((f) => (f.type === 'group' ? f.fields : [f]));
}

function readForm(form, fields) {
  const values = {};
  for (const f of flatFields(fields)) {
    const input = form.elements[f.name];
    if (!input) continue;
    if (f.type === 'switch') values[f.name] = input.checked;
    else if (f.type === 'number') values[f.name] = input.value === '' ? null : Number(input.value);
    else values[f.name] = input.value.trim();
  }
  return values;
}

function validate(fields, values, form) {
  let firstBad = null;
  for (const f of flatFields(fields)) {
    const slot = form.querySelector(`[data-error-for="${f.name}"]`);
    const input = form.elements[f.name];
    let msg = '';
    const v = values[f.name];
    if (f.required && (v === '' || v === null || v === undefined)) msg = 'This is required.';
    else if (f.type === 'email' && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) msg = 'That email does not look right.';
    else if (f.type === 'number' && v !== null) {
      if (f.min !== undefined && v < f.min) msg = `Must be at least ${f.min}.`;
      if (f.max !== undefined && v > f.max) msg = `Must be at most ${f.max}.`;
    } else if (f.validate) msg = f.validate(v, values) || '';

    if (slot) { slot.textContent = msg; slot.hidden = !msg; }
    if (input && input.setAttribute) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg && !firstBad) firstBad = input;
  }
  firstBad?.focus();
  return !!firstBad;
}

/* ------------------------------------------------------------ skeletons -- */

export function skeletonCards(count = 3, className = 'skeleton--card') {
  return Array.from({ length: count },
    () => `<div class="skeleton ${className}"></div>`).join('');
}

export function skeletonRows(count = 5) {
  return Array.from({ length: count }, () => `
    <div class="skeleton-row">
      <div class="skeleton skeleton--avatar"></div>
      <div style="flex:1">
        <div class="skeleton skeleton--text" style="width:38%"></div>
        <div class="skeleton skeleton--text" style="width:62%"></div>
      </div>
      <div class="skeleton skeleton--pill" style="width:96px"></div>
    </div>`).join('');
}

export function emptyState({ iconName = 'note', title = 'Nothing here yet', text = '', action = '' }) {
  return `<div class="empty">${icon(iconName, { size: 34 })}
    <h4>${esc(title)}</h4>
    ${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
}

/* --------------------------------------------------------------- reveal -- */

let revealObserver = null;

/** Fades sections in as they enter. Idempotent — call again after render. */
export function observeReveals(root = document) {
  if (!('IntersectionObserver' in window)) {
    $$('.reveal', root).forEach((n) => n.classList.add('is-in'));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-in');
        revealObserver.unobserve(e.target);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  }
  for (const node of $$('.reveal:not(.is-in)', root)) revealObserver.observe(node);
}

/** Stagger children of a container by index, capped so long lists do not
 *  end up waiting seconds for the last item. */
export function stagger(container, step = 60, max = 8) {
  Array.from(container.children).forEach((child, i) => {
    child.style.setProperty('--reveal-delay', `${Math.min(i, max) * step}ms`);
  });
}

/* -------------------------------------------------------- drag ordering -- */

/**
 * Pointer-driven reordering for a list of `[data-id]` rows with a
 * `[data-drag-handle]` inside. Calls `onReorder(idsInNewOrder)` on drop.
 * Keyboard users get the same result from the handle's arrow keys.
 */
export function makeSortable(list, onReorder) {
  let dragging = null;

  const ids = () => $$('[data-id]', list).map((n) => n.dataset.id);

  list.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('[data-drag-handle]');
    if (!handle || e.button !== 0) return;
    dragging = handle.closest('[data-id]');
    if (!dragging) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    dragging.classList.add('is-dragging');
  });

  list.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rows = $$('[data-id]', list).filter((n) => n !== dragging);
    const after = rows.find((row) => {
      const box = row.getBoundingClientRect();
      return e.clientY < box.top + box.height / 2;
    });
    if (after) list.insertBefore(dragging, after);
    else list.append(dragging);
  });

  const drop = () => {
    if (!dragging) return;
    dragging.classList.remove('is-dragging');
    dragging = null;
    onReorder(ids());
  };
  list.addEventListener('pointerup', drop);
  list.addEventListener('pointercancel', drop);

  list.addEventListener('keydown', (e) => {
    const handle = e.target.closest('[data-drag-handle]');
    if (!handle) return;
    const row = handle.closest('[data-id]');
    if (e.key === 'ArrowUp' && row.previousElementSibling) {
      e.preventDefault();
      list.insertBefore(row, row.previousElementSibling);
    } else if (e.key === 'ArrowDown' && row.nextElementSibling) {
      e.preventDefault();
      list.insertBefore(row, row.nextElementSibling.nextElementSibling);
    } else return;
    handle.focus();
    onReorder(ids());
  });
}

/* ----------------------------------------------------------- misc utils -- */

/** Read a File as a data URL, downscaled so localStorage-backed demo mode and
 *  storage uploads both stay small. Returns a data URL string. */
export function fileToDataUrl(file, maxEdge = 1400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(String(reader.result));
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        if (scale === 1 && String(reader.result).length < 400000) return resolve(String(reader.result));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function pickFile(accept = 'image/*') {
  return new Promise((resolve) => {
    const input = el('input', { type: 'file', accept, style: 'display:none' });
    input.addEventListener('change', () => {
      resolve(input.files?.[0] || null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}

export function copyText(text) {
  return navigator.clipboard?.writeText(text)
    .then(() => toast('Copied'))
    .catch(() => toast('Could not copy', { type: 'error' }));
}
