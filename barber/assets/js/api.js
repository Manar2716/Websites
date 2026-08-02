/* ==========================================================================
   The data layer entry point.

   One contract, two implementations. Everything above this line — the site,
   the booking flow, the admin — is written against `api` and does not know
   or care which backend answered.
   ========================================================================== */

import { createDemoBackend } from './backend-demo.js';
import { configureMoney } from './ui.js';

const OVERRIDE_KEY = 'fadeco.supabase';

function readConfig() {
  const file = window.FADECO_CONFIG || {};
  // A local override lets someone point a deployed copy at their own project
  // from the admin's Connection panel without editing config.js on the server.
  let override = {};
  try {
    override = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}');
  } catch { /* ignore a corrupt override */ }
  return {
    supabaseModule: 'https://esm.sh/@supabase/supabase-js@2.45.4',
    storageBucket: 'media',
    ...file,
    ...override,
  };
}

export function saveConnection({ supabaseUrl, supabaseAnonKey }) {
  if (!supabaseUrl || !supabaseAnonKey) localStorage.removeItem(OVERRIDE_KEY);
  else localStorage.setItem(OVERRIDE_KEY, JSON.stringify({ supabaseUrl, supabaseAnonKey }));
}

export function connectionInfo() {
  const cfg = readConfig();
  return {
    configured: Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey),
    url: cfg.supabaseUrl || '',
    overridden: Boolean(localStorage.getItem(OVERRIDE_KEY)),
  };
}

let backendPromise = null;

/** Resolves the backend once per page load. */
export function getBackend() {
  if (backendPromise) return backendPromise;
  const cfg = readConfig();

  backendPromise = (async () => {
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return createDemoBackend();
    try {
      const { createSupabaseBackend } = await import('./backend-supabase.js');
      return await createSupabaseBackend(cfg);
    } catch (err) {
      // A missing library or an unreachable project must not leave a blank
      // page: fall back, and let the banner explain what happened.
      console.error('[fadeco] Supabase unavailable, using the demo backend.', err);
      const backend = createDemoBackend();
      backend.degraded = err instanceof Error ? err.message : String(err);
      return backend;
    }
  })();

  return backendPromise;
}

/* ---------------------------------------------------------------- context */

let contextPromise = null;

/**
 * Settings + site copy, fetched once and shared. Almost every render needs
 * the timezone and the currency, so making each caller fetch them separately
 * would mean a dozen duplicate requests on first paint.
 */
export function getContext({ refresh = false } = {}) {
  if (refresh) contextPromise = null;
  if (contextPromise) return contextPromise;

  contextPromise = (async () => {
    const api = await getBackend();
    const [settings, content] = await Promise.all([api.settings.get(), api.content.all()]);
    configureMoney(settings.currency || 'EUR');
    return { api, settings, content, tz: settings.timezone };
  })();

  return contextPromise;
}

/** Section of site copy with defaults applied, so a missing row never
 *  renders "undefined" into the page. */
export function section(content, key, fallback = {}) {
  return { ...fallback, ...(content?.[key] || {}) };
}
