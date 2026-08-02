/* ==========================================================================
   Admin shell — the auth gate, the sidebar, and a hash router.

   The gate is a convenience, not the security boundary. Row level security is
   the boundary: with no admin session every query this app makes comes back
   empty or refused, so hiding the UI is about not showing an operator a
   broken screen rather than about keeping anyone out.
   ========================================================================== */

import { getBackend, getContext, connectionInfo, saveConnection } from '../api.js';
import { icon } from '../icons.js';
import { fillBrand } from '../chrome.js';
import {
  $, el, esc, initTheme, initials, toast, toastError, errorMessage, confirmDialog, formDialog,
} from '../ui.js';

const ROUTES = [
  { group: 'Today' },
  { key: 'dashboard', label: 'Dashboard', icon: 'dashboard', load: () => import('./view-dashboard.js') },
  { key: 'appointments', label: 'Appointments', icon: 'calendar', load: () => import('./view-appointments.js') },
  { key: 'customers', label: 'Customers', icon: 'users', load: () => import('./view-customers.js') },
  { group: 'The shop' },
  { key: 'services', label: 'Services', icon: 'scissors', load: () => import('./view-services.js') },
  { key: 'barbers', label: 'Barbers', icon: 'user', load: () => import('./view-barbers.js') },
  { key: 'schedule', label: 'Schedule', icon: 'clock', load: () => import('./view-schedule.js') },
  { group: 'Website' },
  { key: 'content', label: 'Content', icon: 'note', load: () => import('./view-content.js') },
  { key: 'gallery', label: 'Gallery', icon: 'image', load: () => import('./view-gallery.js') },
  { key: 'reviews', label: 'Testimonials', icon: 'quote', load: () => import('./view-reviews.js') },
  { group: 'System' },
  { key: 'settings', label: 'Settings', icon: 'settings', load: () => import('./view-settings.js') },
];

const app = {
  api: null,
  ctx: null,
  session: null,
  current: null,
  /** Views call this to redraw after a write that changes another view's data. */
  reload: () => route(),
  navigate: (key, params = '') => { location.hash = `#/${key}${params}`; },
};

initTheme();
start();

async function start() {
  app.api = await getBackend();

  const session = await app.api.auth.getSession();
  if (session) await enter(session);
  else showLogin();

  app.api.auth.onChange(async (next) => {
    if (next && !app.session) await enter(next);
    else if (!next && app.session) location.reload();
  });
}

/* ------------------------------------------------------------------ auth -- */

function showLogin({ message = '' } = {}) {
  const gate = $('#auth');
  const app$ = $('#app');
  app$.hidden = true;
  gate.hidden = false;

  const demo = app.api.isDemo ? app.api.demoCredentials() : null;

  gate.innerHTML = `
    <section class="glass auth-card">
      <span class="brand-mark" data-brand-mark>F</span>
      <h1>Sign in</h1>
      <p>This dashboard belongs to one account. Customers never see it and cannot create one.</p>
      ${message ? `<p class="field-error" style="margin-top:var(--space-4)">${esc(message)}</p>` : ''}
      <form class="auth-form" id="login" novalidate>
        <div class="field">
          <label for="email">Email</label>
          <input class="input" id="email" name="email" type="email" autocomplete="username"
                 value="${esc(demo?.email || '')}" required>
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input class="input" id="password" name="password" type="password"
                 autocomplete="current-password" value="${esc(demo?.password || '')}" required>
        </div>
        <button class="btn btn--primary btn--block btn--lg" type="submit">
          ${icon('lock', { size: 17 })}Sign in</button>
      </form>
      ${demo ? `<div class="auth-note">
        <strong>Demo mode.</strong> No Supabase project is connected, so this signs you into a
        browser-local copy of the data. The credentials are filled in for you:
        <code>${esc(demo.email)}</code> / <code>${esc(demo.password)}</code>.
        Connect a project from Settings once you have run <code>schema.sql</code>.
      </div>` : ''}
      <a class="auth-back" href="../index.html">← Back to the website</a>
    </section>`;

  $('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.classList.add('is-busy');
    try {
      const session = await app.api.auth.signIn(
        form.elements.email.value.trim(), form.elements.password.value);
      await enter(session);
    } catch (err) {
      button.classList.remove('is-busy');
      showLogin({ message: errorMessage(err) });
    }
  });

  $('#email')?.focus();
}

let entering = false;

async function enter(session) {
  // signIn() resolving and the auth-change listener firing are two paths into
  // the same place; without this the shell mounts twice and every toolbar
  // button appears in duplicate.
  if (entering || app.session) return;
  entering = true;
  app.session = session;
  $('#auth').hidden = true;
  $('#auth').innerHTML = '';
  $('#app').hidden = false;

  app.ctx = await getContext({ refresh: true });
  fillBrand(app.ctx.content);

  renderUser();
  renderNav();
  wireShell();

  addEventListener('hashchange', route);
  entering = false;
  await route();
}

function renderUser() {
  const email = app.session?.user?.email || 'admin';
  $('#user').innerHTML = `
    <span class="avatar">${esc(initials(email.split('@')[0].replace(/[._-]/g, ' ')))}</span>
    <div><strong>Signed in</strong><span title="${esc(email)}">${esc(email)}</span></div>`;
}

function wireShell() {
  $('#signout').onclick = async () => {
    const ok = await confirmDialog({
      title: 'Sign out?', body: 'You will need your password to get back in.',
      confirmLabel: 'Sign out',
    });
    if (!ok) return;
    await app.api.auth.signOut();
    location.reload();
  };

  const toggle = $('#nav-toggle');
  toggle.innerHTML = icon('menu', { size: 20 });
  toggle.onclick = () => setNav(!$('#app').classList.contains('nav-open'));

  $('#nav').addEventListener('click', (e) => {
    if (e.target.closest('a')) setNav(false);
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setNav(false); });
}

function setNav(open) {
  const shell = $('#app');
  shell.classList.toggle('nav-open', open);
  $('#nav-toggle').setAttribute('aria-expanded', String(open));
  $('#scrim')?.remove();
  if (open) {
    shell.append(el('div', { class: 'scrim', id: 'scrim', onclick: () => setNav(false) }));
  }
}

function renderNav() {
  $('#nav').innerHTML = ROUTES.map((r) => (r.group
    ? `<p class="sidebar-group">${esc(r.group)}</p>`
    : `<a class="sidebar-link" href="#/${r.key}" data-key="${r.key}">
        ${icon(r.icon, { size: 18 })}<span>${esc(r.label)}</span>
        <span class="count" data-count="${r.key}" hidden></span></a>`)).join('');
}

/** Views can surface a number in the sidebar (pending approvals, say). */
export function setBadge(key, value) {
  const node = document.querySelector(`[data-count="${key}"]`);
  if (!node) return;
  node.hidden = !value;
  node.textContent = value || '';
}

/* ---------------------------------------------------------------- router -- */

async function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [key, query] = hash.split('?');
  const target = ROUTES.find((r) => r.key === (key || 'dashboard')) || ROUTES[1];

  for (const link of document.querySelectorAll('.sidebar-link')) {
    link.classList.toggle('is-active', link.dataset.key === target.key);
  }

  const view = $('#view');
  const actions = $('#view-actions');
  view.innerHTML = `<div class="glass panel"><div class="panel-body">
    <div class="skeleton skeleton--text" style="width:30%"></div>
    <div class="skeleton skeleton--card" style="margin-top:16px"></div></div></div>`;
  actions.innerHTML = '';
  $('#view-title').textContent = target.label;
  $('#view-sub').textContent = '';
  app.current = target.key;

  try {
    const module = await target.load();
    if (app.current !== target.key) return; // a faster click won
    view.innerHTML = ''; // drop the loading skeleton; views bring their own
    await module.render({
      view,
      actions,
      app,
      api: app.ctx.api,
      ctx: app.ctx,
      params: new URLSearchParams(query || ''),
      setTitle: (title, sub = '') => {
        $('#view-title').textContent = title;
        $('#view-sub').textContent = sub;
      },
    });
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="glass panel"><div class="empty">${icon('alert', { size: 34 })}
      <h4>This screen could not load</h4><p>${esc(errorMessage(err))}</p></div></div>`;
    toastError(err);
  }
}

/* ------------------------------------------------------------ connection -- */

/** Shown from Settings; also reachable when the app is in demo mode. */
export async function connectionDialog() {
  const info = connectionInfo();
  const values = await formDialog({
    title: 'Connect a Supabase project',
    subtitle: 'Stored in this browser only. For a permanent setup, edit config.js on the server.',
    iconName: 'layers',
    submitLabel: 'Save and reload',
    fields: [
      { name: 'supabaseUrl', label: 'Project URL', value: info.url,
        placeholder: 'https://xxxxxxxx.supabase.co',
        hint: 'Supabase → Project Settings → API' },
      { name: 'supabaseAnonKey', label: 'Anon (public) key', type: 'textarea', rows: 3,
        placeholder: 'eyJhbGciOi…',
        hint: 'The publishable key. Never paste the service role key here.' },
    ],
  });
  if (!values) return;
  saveConnection(values);
  toast('Connection saved', { text: 'Reloading…' });
  setTimeout(() => location.reload(), 600);
}

export async function disconnect() {
  saveConnection({});
  toast('Disconnected', { text: 'Back to demo data. Reloading…' });
  setTimeout(() => location.reload(), 600);
}
