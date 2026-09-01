/* Screen plumbing and the small DOM helpers the rest of the UI is built
   from. Nothing clever here on purpose — the interesting parts of this
   game are elsewhere, and a menu system should be boring. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export class Screens {
  constructor(audio) {
    this.audio = audio;
    this.stack = [];
    this.current = 'main';
    this.onChange = null;
  }

  show(name, push = true) {
    const next = document.getElementById('screen-' + name);
    if (!next) return;
    for (const s of $$('.screen')) s.classList.remove('is-active');
    next.classList.add('is-active');
    next.scrollTop = 0;
    if (push && this.current !== name) this.stack.push(this.current);
    this.current = name;
    document.getElementById('screens').style.display = '';
    if (this.onChange) this.onChange(name);
  }

  back(fallback = 'main') {
    const prev = this.stack.pop() || fallback;
    this.show(prev, false);
    if (this.audio) this.audio.uiBack();
  }

  hideAll() {
    for (const s of $$('.screen')) s.classList.remove('is-active');
    document.getElementById('screens').style.display = 'none';
    this.current = null;
  }
}

let toastTimer = 0;
export function toast(message, bad = false, ms = 2600) {
  const wrap = document.getElementById('toasts');
  const t = el('div', 'toast' + (bad ? ' is-bad' : ''), message);
  wrap.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .25s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 280);
  }, ms);
  // Never let a burst of errors build an unbounded column.
  while (wrap.children.length > 4) wrap.firstChild.remove();
}

export function fmtTime(seconds) {
  if (!Number.isFinite(seconds) || seconds >= 60000) return '∞';
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtPct(v) { return (v * 100).toFixed(1) + '%'; }

/* A slider, a switch or a row of chips, built from one schema row. Used by
   the settings screen and the match-settings block on the setup screen. */
export function control(row, value, onChange) {
  const wrap = el('div', 'opt');
  const head = el('div', 'opt__head');
  head.appendChild(el('span', 'opt__label', row.label));
  const valEl = el('span', 'opt__value');
  wrap.appendChild(head);

  const emit = (v) => { onChange(v); if (row.format) valEl.textContent = row.format(v); else valEl.textContent = String(v); };

  if (row.type === 'toggle') {
    const sw = el('button', 'switch' + (value ? ' is-on' : ''));
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(!!value));
    sw.setAttribute('aria-label', row.label);
    sw.onclick = () => {
      const on = !sw.classList.contains('is-on');
      sw.classList.toggle('is-on', on);
      sw.setAttribute('aria-checked', String(on));
      onChange(on);
    };
    head.appendChild(sw);
  } else if (row.type === 'range') {
    head.appendChild(valEl);
    valEl.textContent = row.format ? row.format(value) : String(value);
    const input = el('input');
    input.type = 'range';
    input.min = row.min; input.max = row.max; input.step = row.step;
    input.value = value;
    input.setAttribute('aria-label', row.label);
    input.oninput = () => emit(parseFloat(input.value));
    wrap.appendChild(input);
  } else if (row.type === 'choice') {
    const box = el('div', 'opt__choices');
    for (const [v, label] of row.options) {
      const b = el('button', 'chip' + (String(v) === String(value) ? ' is-on' : ''), label);
      b.onclick = () => {
        for (const c of box.children) c.classList.remove('is-on');
        b.classList.add('is-on');
        onChange(v);
      };
      box.appendChild(b);
    }
    wrap.appendChild(box);
  } else if (row.type === 'colour') {
    const input = el('input');
    input.type = 'color';
    input.value = value;
    input.setAttribute('aria-label', row.label);
    input.oninput = () => onChange(input.value);
    head.appendChild(input);
  } else if (row.type === 'action') {
    const b = el('button', 'btn btn--ghost', 'OPEN');
    b.onclick = () => onChange(row.action);
    head.appendChild(b);
  }

  if (row.hint) wrap.appendChild(el('p', 'opt__hint', row.hint));
  return wrap;
}
