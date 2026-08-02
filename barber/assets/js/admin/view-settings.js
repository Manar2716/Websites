/* ==========================================================================
   Settings — locale, booking rules, the Supabase connection, and a plain
   description of how the single admin account actually works.
   ========================================================================== */

import { icon } from '../icons.js';
import { el, esc, formDialog, confirmDialog, toast, toastError } from '../ui.js';
import { getContext, connectionInfo } from '../api.js';
import { connectionDialog, disconnect } from './app.js';
import { panel } from './common.js';

const ZONES = (() => {
  const list = typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : ['Europe/Amsterdam', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
      'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];
  return list;
})();

const CURRENCIES = [
  ['EUR', '€'], ['GBP', '£'], ['USD', '$'], ['CHF', 'CHF'], ['SEK', 'kr'],
  ['DKK', 'kr'], ['NOK', 'kr'], ['PLN', 'zł'], ['CAD', '$'], ['AUD', '$'],
];

export async function render({ view, ctx, setTitle, app }) {
  setTitle('Settings', 'How the shop works, and what it is connected to.');

  view.append(localePanel(ctx));
  view.append(rulesPanel(ctx, app));
  view.append(connectionPanel(ctx));
  view.append(accountPanel());
}

/* ---------------------------------------------------------------- locale -- */

function localePanel(ctx) {
  const s = ctx.settings;
  const body = el('div', {
    html: `<dl class="kv">
      ${row('Timezone', esc(s.timezone), 'Every time on the site is shown in this zone, whoever is looking.')}
      ${row('Currency', esc(`${s.currency} (${s.currency_symbol})`), 'Prices are stored in cents and formatted from here.')}
    </dl>`,
  });

  const button = el('button', {
    class: 'btn btn--ghost btn--sm', type: 'button',
    html: `${icon('pencil', { size: 16 })}Change`,
    onclick: async () => {
      const values = await formDialog({
        title: 'Locale',
        subtitle: 'Changing the timezone re-labels existing appointments; it does not move them.',
        iconName: 'settings',
        submitLabel: 'Save',
        fields: [
          { name: 'timezone', label: 'Timezone', type: 'select', value: s.timezone,
            options: ZONES.map((z) => ({ value: z, label: z })) },
          { name: 'currency', label: 'Currency', type: 'select', value: s.currency,
            options: CURRENCIES.map(([code, symbol]) => ({ value: code, label: `${code} ${symbol}` })) },
        ],
        onSubmit: (v) => ctx.api.settings.update({
          timezone: v.timezone,
          currency: v.currency,
          currency_symbol: CURRENCIES.find(([c]) => c === v.currency)?.[1] || v.currency,
        }),
      });
      if (values) {
        await getContext({ refresh: true });
        toast('Locale saved', { text: 'Reloading so every screen picks it up…' });
        setTimeout(() => location.reload(), 700);
      }
    },
  });

  return panel({ title: 'Locale', actions: button, body });
}

/* ----------------------------------------------------------------- rules -- */

function rulesPanel(ctx, app) {
  const s = ctx.settings;
  const body = el('div', {
    html: `<dl class="kv">
      ${row('Booking interval', `${s.booking_interval_minutes} minutes`, '')}
      ${row('Shortest notice', `${s.lead_time_minutes} minutes`, '')}
      ${row('Booking horizon', `${s.max_advance_days} days`, '')}
      ${row('Confirmation', s.auto_confirm ? 'Automatic' : 'Manual approval', '')}
    </dl>`,
  });

  return panel({
    title: 'Booking rules',
    subtitle: 'Edited on the Schedule screen, alongside the opening hours they interact with.',
    actions: el('button', {
      class: 'btn btn--ghost btn--sm', type: 'button',
      html: `${icon('clock', { size: 16 })}Open Schedule`,
      onclick: () => app.navigate('schedule'),
    }),
    body,
  });
}

/* ------------------------------------------------------------ connection -- */

function connectionPanel(ctx) {
  const info = connectionInfo();
  const demo = ctx.api.isDemo;

  const body = el('div', {},
    el('dl', {
      class: 'kv',
      html: `${row('Backend', demo ? 'Demo (this browser only)' : 'Supabase',
        demo
          ? 'Data lives in localStorage. Nothing is shared between devices and nothing is secure.'
          : 'Row level security is enforced by the database on every request.')}
      ${info.url ? row('Project', esc(info.url), info.overridden
        ? 'Set from this browser. config.js on the server still holds the permanent value.'
        : 'From config.js.') : ''}`,
    }),
    demo
      ? el('div', {
        class: 'auth-note',
        style: 'margin-top:var(--space-4)',
        html: `<strong>To go live:</strong> run <code>supabase/schema.sql</code> and
          <code>supabase/seed.sql</code> in the Supabase SQL editor, create your admin user under
          Authentication → Users, insert it into <code>admin_users</code>, then connect below.
          The full steps are in the project README.`,
      })
      : null);

  const actions = el('div', { style: 'display:flex;gap:var(--space-2)' },
    el('button', {
      class: 'btn btn--primary btn--sm', type: 'button',
      html: `${icon('layers', { size: 16 })}${info.configured ? 'Change connection' : 'Connect Supabase'}`,
      onclick: () => connectionDialog(),
    }),
    info.overridden
      ? el('button', {
        class: 'btn btn--ghost btn--sm', type: 'button', text: 'Clear override',
        onclick: async () => {
          const ok = await confirmDialog({
            title: 'Clear the stored connection?',
            body: 'This browser goes back to whatever config.js says — demo data, if it is empty.',
            confirmLabel: 'Clear', danger: true,
          });
          if (ok) disconnect();
        },
      })
      : null);

  const panelNode = panel({ title: 'Backend', actions, body });

  if (demo) {
    body.append(el('div', { class: 'editor-foot' },
      el('span', { class: 'dim', text: 'Demo data can be put back the way it started.' }),
      el('button', {
        class: 'btn btn--ghost btn--sm', type: 'button',
        html: `${icon('refresh', { size: 16 })}Reset demo data`,
        onclick: async () => {
          const ok = await confirmDialog({
            title: 'Reset the demo data?',
            body: 'Every booking, customer and edit made in this browser is discarded and the '
              + 'sample shop is rebuilt.',
            confirmLabel: 'Reset everything', danger: true,
          });
          if (!ok) return;
          try {
            await ctx.api.reset();
            toast('Demo data reset', { text: 'Reloading…' });
            setTimeout(() => location.reload(), 600);
          } catch (err) {
            toastError(err);
          }
        },
      })));
  }

  return panelNode;
}

/* --------------------------------------------------------------- account -- */

function accountPanel() {
  return panel({
    title: 'Admin account',
    subtitle: 'There is exactly one, and it cannot be created from the website.',
    body: el('div', {
      html: `<dl class="kv">
        ${row('Who can sign in', 'The single row in <code>admin_users</code>',
          'That table has row level security forced and no policies at all, so no API request '
          + 'can read or write it. Adding an admin is a deliberate act in the SQL editor.')}
        ${row('What a customer can do', 'Book, look up and cancel their own appointment',
          'Three functions, each requiring the booking reference and the phone number on it. '
          + 'Nothing else is reachable without an admin session.')}
        ${row('If someone signs up anyway', 'They get nothing',
          'A Supabase account that is not in <code>admin_users</code> is refused at sign-in and '
          + 'would be refused by every policy even if it were not.')}
        ${row('Changing the password', 'Supabase → Authentication → Users',
          'Password resets and email changes are handled by Supabase, not by this dashboard.')}
      </dl>`,
    }),
  });
}

function row(label, value, hint) {
  return `<div class="kv-row"><dt>${esc(label)}</dt>
    <dd><strong style="font-weight:570">${value}</strong>
      ${hint ? `<span class="dim" style="display:block;font-size:.82rem;margin-top:2px">${hint}</span>` : ''}
    </dd></div>`;
}
