/* ==========================================================================
   Demo backend

   A complete implementation of the data contract against localStorage, used
   when no Supabase credentials are configured. It exists so the product can
   be opened, clicked through and evaluated with nothing installed — and so
   the UI has one contract to code against rather than two.

   It deliberately mirrors the server rules rather than relaxing them: the
   same availability logic, the same overlap rejection, the same validation.
   What it cannot do is share data between devices, or be secure — the
   "session" is a localStorage flag. Never point a real shop at this.
   ========================================================================== */

import { buildDemoData, uid, reference } from './demo-data.js';
import {
  addDays, hmToMinutes, minutesToHm, todayIn, weekdayOf, zonedToInstant, daysBetween,
} from './time.js';

const KEY = 'fadeco.demo.v3';
const SESSION_KEY = 'fadeco.demo.session';
const LATENCY = 90; // enough for skeletons to be real, not enough to annoy

let db = null;
const listeners = new Set();

function load() {
  if (db) return db;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      db = JSON.parse(raw);
      if (db && db.services && db.appointments) return db;
    }
  } catch { /* corrupt payload — reseed below */ }
  db = buildDemoData();
  save();
  return db;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (err) {
    // Quota is the realistic failure here, from uploaded images.
    throw new Error('Demo storage is full. Remove some uploaded images, or connect Supabase.');
  }
}

/** Every write goes through here so latency and persistence are uniform. */
async function tx(fn) {
  load();
  await sleep(LATENCY);
  const result = fn(db);
  save();
  return clone(result);
}

async function read(fn) {
  load();
  await sleep(LATENCY);
  return clone(fn(db));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const byOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0);

function fail(message) {
  throw new Error(message);
}

/* ------------------------------------------------------------ availability */

function scheduleFor(data, barberId, ymd) {
  const dow = weekdayOf(ymd);
  return data.schedules.find((s) => s.barber_id === barberId && s.weekday === dow)
    || data.schedules.find((s) => s.barber_id === null && s.weekday === dow)
    || null;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Free start times for one barber / service / day. This is a direct port of
 * `get_available_slots()` in schema.sql; the two must stay in step.
 */
function computeSlots(data, { barberId, serviceId, date, ignoreAppointmentId = null, ignoreLeadTime = false }) {
  const s = data.settings;
  const service = data.services.find((x) => x.id === serviceId && x.is_active);
  if (!service) return [];

  const barber = data.barbers.find((b) => b.id === barberId);
  if (!barber || !barber.is_active || barber.on_vacation) return [];

  const today = todayIn(s.timezone);
  if (daysBetween(today, date) < 0 || daysBetween(today, date) > s.max_advance_days) return [];

  const sched = scheduleFor(data, barberId, date);
  if (!sched || sched.is_closed) return [];

  const open = hmToMinutes(sched.opens_at);
  const close = hmToMinutes(sched.closes_at);
  const breakStart = sched.break_start ? hmToMinutes(sched.break_start) : null;
  const breakEnd = sched.break_end ? hmToMinutes(sched.break_end) : null;

  const earliest = ignoreLeadTime ? 0 : Date.now() + s.lead_time_minutes * 60000;
  const busy = data.appointments
    .filter((a) => a.barber_id === barberId && a.status !== 'cancelled' && a.id !== ignoreAppointmentId)
    .map((a) => [Date.parse(a.starts_at), Date.parse(a.ends_at)]);
  const blocks = data.time_blocks
    .filter((b) => b.barber_id === null || b.barber_id === barberId)
    .map((b) => [Date.parse(b.starts_at), Date.parse(b.ends_at)]);

  const out = [];
  for (let m = open; m + service.duration_minutes <= close; m += s.booking_interval_minutes) {
    const start = zonedToInstant(date, minutesToHm(m), s.timezone).getTime();
    const end = start + (service.duration_minutes + s.buffer_minutes) * 60000;

    if (start < earliest) continue;
    if (breakStart !== null && m < breakEnd && m + service.duration_minutes + s.buffer_minutes > breakStart) continue;
    if (busy.some(([bs, be]) => overlaps(start, end, bs, be))) continue;
    if (blocks.some(([bs, be]) => overlaps(start, end, bs, be))) continue;

    out.push({
      slot_start: new Date(start).toISOString(),
      slot_end: new Date(start + service.duration_minutes * 60000).toISOString(),
    });
  }
  return out;
}

function assertFree(data, { barberId, start, end, ignoreId = null }) {
  const clash = data.appointments.some((a) =>
    a.barber_id === barberId
    && a.status !== 'cancelled'
    && a.id !== ignoreId
    && overlaps(start, end, Date.parse(a.starts_at), Date.parse(a.ends_at)));
  if (clash) fail('That time overlaps another appointment for this barber.');
}

/* ------------------------------------------------------------------ joins */

function decorate(data, a) {
  return {
    ...a,
    customer: data.customers.find((c) => c.id === a.customer_id) || null,
    barber: data.barbers.find((b) => b.id === a.barber_id) || null,
    service: data.services.find((s) => s.id === a.service_id) || null,
  };
}

function syncCustomerStats(data, customerId) {
  const c = data.customers.find((x) => x.id === customerId);
  if (!c) return;
  const done = data.appointments.filter((a) => a.customer_id === customerId && a.status === 'completed');
  c.visit_count = done.length;
  c.total_spend_cents = done.reduce((sum, a) => sum + a.price_cents, 0);
  c.last_visit_at = done.length ? done.map((a) => a.starts_at).sort().at(-1) : null;
}

const digits = (v) => String(v || '').replace(/\D/g, '');

function upsertCustomer(data, { name, phone, email, barberId }) {
  const key = digits(phone);
  let c = data.customers.find((x) => digits(x.phone) === key);
  if (c) {
    c.name = name || c.name;
    c.phone = phone;
    if (email) c.email = email;
    c.favorite_barber_id = c.favorite_barber_id || barberId || null;
  } else {
    c = {
      id: uid(), name, phone, email: email || null, notes: '',
      favorite_barber_id: barberId || null, visit_count: 0, total_spend_cents: 0,
      last_visit_at: null, created_at: new Date().toISOString(),
    };
    data.customers.push(c);
  }
  return c;
}

function nextRef(data) {
  let ref;
  do { ref = reference(); } while (data.appointments.some((a) => a.reference === ref));
  return ref;
}

function validateBooking({ name, phone, email }) {
  if (!name || name.trim().length < 2) fail('Please enter your full name');
  if (digits(phone).length < 7) fail('Please enter a valid phone number');
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail('Please enter a valid email address');
}

/* ------------------------------------------------------------------- api -- */

function reorder(list, ids) {
  ids.forEach((id, i) => {
    const row = list.find((x) => x.id === id);
    if (row) row.sort_order = i + 1;
  });
  return list.slice().sort(byOrder);
}

function emitAuth() {
  const session = currentSession();
  for (const fn of listeners) fn(session);
}

function currentSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function createDemoBackend() {
  return {
    isDemo: true,

    demoCredentials: () => {
      const data = load();
      return { email: data.admin.email, password: data.admin.password };
    },

    reset: async () => {
      localStorage.removeItem(KEY);
      db = null;
      load();
    },

    auth: {
      async getSession() {
        await sleep(20);
        return currentSession();
      },
      async signIn(email, password) {
        await sleep(340);
        const data = load();
        if (String(email).trim().toLowerCase() !== data.admin.email
          || password !== data.admin.password) {
          fail('Invalid login credentials');
        }
        const session = { user: { id: 'demo-admin', email: data.admin.email }, demo: true };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        emitAuth();
        return session;
      },
      async signOut() {
        localStorage.removeItem(SESSION_KEY);
        emitAuth();
      },
      onChange(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
    },

    settings: {
      get: () => read((d) => d.settings),
      update: (patch) => tx((d) => Object.assign(d.settings, patch)),
    },

    content: {
      all: () => read((d) => d.website_content),
      set: (key, value) => tx((d) => { d.website_content[key] = value; return value; }),
    },

    services: {
      list: ({ all = false } = {}) =>
        read((d) => d.services.filter((s) => all || s.is_active).sort(byOrder)),
      create: (row) => tx((d) => {
        const item = {
          id: uid(), name: '', description: '', price_cents: 0, duration_minutes: 30,
          icon: 'scissors', is_active: true, is_featured: false,
          sort_order: d.services.length + 1, ...row,
        };
        d.services.push(item);
        return item;
      }),
      update: (id, patch) => tx((d) => Object.assign(d.services.find((s) => s.id === id), patch)),
      remove: (id) => tx((d) => {
        if (d.appointments.some((a) => a.service_id === id)) {
          fail('This service has appointments against it. Disable it instead of deleting.');
        }
        d.services = d.services.filter((s) => s.id !== id);
      }),
      reorder: (ids) => tx((d) => reorder(d.services, ids)),
    },

    barbers: {
      list: ({ all = false } = {}) =>
        read((d) => d.barbers.filter((b) => all || b.is_active).sort(byOrder)),
      create: (row) => tx((d) => {
        const item = {
          id: uid(), name: '', title: '', bio: '', photo_url: null, specialties: [],
          instagram: '', is_active: true, on_vacation: false, vacation_note: '',
          sort_order: d.barbers.length + 1, ...row,
        };
        d.barbers.push(item);
        return item;
      }),
      update: (id, patch) => tx((d) => Object.assign(d.barbers.find((b) => b.id === id), patch)),
      remove: (id) => tx((d) => {
        if (d.appointments.some((a) => a.barber_id === id)) {
          fail('This barber has appointments in the diary. Deactivate them instead of deleting.');
        }
        d.barbers = d.barbers.filter((b) => b.id !== id);
        d.schedules = d.schedules.filter((s) => s.barber_id !== id);
        d.time_blocks = d.time_blocks.filter((t) => t.barber_id !== id);
      }),
      reorder: (ids) => tx((d) => reorder(d.barbers, ids)),
    },

    schedules: {
      list: (barberId = null) =>
        read((d) => d.schedules.filter((s) => s.barber_id === barberId)
          .sort((a, b) => a.weekday - b.weekday)),
      upsert: (row) => tx((d) => {
        const existing = d.schedules.find((s) =>
          s.barber_id === (row.barber_id ?? null) && s.weekday === row.weekday);
        if (existing) return Object.assign(existing, row);
        const item = { id: uid(), barber_id: null, break_start: null, break_end: null, ...row };
        d.schedules.push(item);
        return item;
      }),
      clearBarber: (barberId) => tx((d) => {
        d.schedules = d.schedules.filter((s) => s.barber_id !== barberId);
      }),
      listBlocks: ({ from = null } = {}) => read((d) => d.time_blocks
        .filter((b) => !from || b.ends_at >= from)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        .map((b) => ({ ...b, barber: d.barbers.find((x) => x.id === b.barber_id) || null }))),
      createBlock: (row) => tx((d) => {
        if (Date.parse(row.ends_at) <= Date.parse(row.starts_at)) fail('The end must be after the start.');
        const item = { id: uid(), barber_id: null, kind: 'block', reason: '', ...row };
        d.time_blocks.push(item);
        return item;
      }),
      removeBlock: (id) => tx((d) => {
        d.time_blocks = d.time_blocks.filter((b) => b.id !== id);
      }),
    },

    gallery: {
      list: ({ all = false } = {}) =>
        read((d) => d.gallery.filter((g) => all || g.is_visible).sort(byOrder)),
      create: (row) => tx((d) => {
        const item = {
          id: uid(), image_url: '', caption: '', alt_text: '', is_visible: true,
          sort_order: d.gallery.length + 1, ...row,
        };
        d.gallery.push(item);
        return item;
      }),
      update: (id, patch) => tx((d) => Object.assign(d.gallery.find((g) => g.id === id), patch)),
      remove: (id) => tx((d) => { d.gallery = d.gallery.filter((g) => g.id !== id); }),
      reorder: (ids) => tx((d) => reorder(d.gallery, ids)),
    },

    reviews: {
      list: ({ all = false } = {}) =>
        read((d) => d.reviews.filter((r) => all || r.is_published).sort(byOrder)),
      create: (row) => tx((d) => {
        const item = {
          id: uid(), author_name: '', author_role: '', rating: 5, body: '',
          barber_id: null, is_published: false, sort_order: d.reviews.length + 1, ...row,
        };
        d.reviews.push(item);
        return item;
      }),
      update: (id, patch) => tx((d) => Object.assign(d.reviews.find((r) => r.id === id), patch)),
      remove: (id) => tx((d) => { d.reviews = d.reviews.filter((r) => r.id !== id); }),
      reorder: (ids) => tx((d) => reorder(d.reviews, ids)),
    },

    customers: {
      list: ({ search = '', limit = 500 } = {}) => read((d) => {
        const q = search.trim().toLowerCase();
        return d.customers
          .filter((c) => !q
            || c.name.toLowerCase().includes(q)
            || digits(c.phone).includes(digits(q) || ' ')
            || (c.email || '').toLowerCase().includes(q))
          .sort((a, b) => (b.last_visit_at || '').localeCompare(a.last_visit_at || '')
            || a.name.localeCompare(b.name))
          .slice(0, limit)
          .map((c) => ({ ...c, favorite_barber: d.barbers.find((b) => b.id === c.favorite_barber_id) || null }));
      }),
      get: (id) => read((d) => {
        const c = d.customers.find((x) => x.id === id);
        if (!c) return null;
        return {
          ...c,
          favorite_barber: d.barbers.find((b) => b.id === c.favorite_barber_id) || null,
          history: d.appointments
            .filter((a) => a.customer_id === id)
            .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
            .map((a) => decorate(d, a)),
        };
      }),
      update: (id, patch) => tx((d) => Object.assign(d.customers.find((c) => c.id === id), patch)),
      remove: (id) => tx((d) => {
        d.appointments = d.appointments.filter((a) => a.customer_id !== id);
        d.customers = d.customers.filter((c) => c.id !== id);
      }),
    },

    appointments: {
      list: ({ from = null, to = null, status = null, barberId = null, search = '', limit = 400 } = {}) =>
        read((d) => {
          const q = search.trim().toLowerCase();
          return d.appointments
            .filter((a) => (!from || a.starts_at >= from)
              && (!to || a.starts_at < to)
              && (!status || a.status === status)
              && (!barberId || a.barber_id === barberId))
            .map((a) => decorate(d, a))
            .filter((a) => !q
              || a.customer?.name.toLowerCase().includes(q)
              || digits(a.customer?.phone).includes(digits(q) || ' ')
              || (a.customer?.email || '').toLowerCase().includes(q)
              || a.reference.toLowerCase().includes(q)
              || (a.service?.name || '').toLowerCase().includes(q))
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
            .slice(0, limit);
        }),

      // Admin-created, including walk-ins. Skips the lead-time rule because
      // a walk-in is by definition happening now.
      create: ({ serviceId, barberId, startsAt, name, phone, email, notes = '', status = 'confirmed', isWalkIn = false, priceCents = null }) =>
        tx((d) => {
          validateBooking({ name, phone, email });
          const service = d.services.find((s) => s.id === serviceId);
          if (!service) fail('Pick a service');
          if (!d.barbers.some((b) => b.id === barberId)) fail('Pick a barber');
          const start = Date.parse(startsAt);
          if (Number.isNaN(start)) fail('Pick a time');
          const end = start + service.duration_minutes * 60000;
          assertFree(d, { barberId, start, end });

          const customer = upsertCustomer(d, { name, phone, email, barberId });
          const row = {
            id: uid(), reference: nextRef(d), customer_id: customer.id, barber_id: barberId,
            service_id: serviceId, starts_at: new Date(start).toISOString(),
            ends_at: new Date(end).toISOString(), status,
            price_cents: priceCents ?? service.price_cents, notes,
            is_walk_in: isWalkIn, created_at: new Date().toISOString(),
          };
          d.appointments.push(row);
          syncCustomerStats(d, customer.id);
          return decorate(d, row);
        }),

      update: (id, patch) => tx((d) => {
        const row = d.appointments.find((a) => a.id === id);
        if (!row) fail('That appointment no longer exists.');

        const next = { ...row, ...patch };
        if (patch.service_id || patch.starts_at) {
          const service = d.services.find((s) => s.id === next.service_id);
          const start = Date.parse(next.starts_at);
          next.ends_at = new Date(start + service.duration_minutes * 60000).toISOString();
          if (patch.service_id && patch.price_cents === undefined) next.price_cents = service.price_cents;
        }
        if (next.status !== 'cancelled') {
          assertFree(d, {
            barberId: next.barber_id,
            start: Date.parse(next.starts_at),
            end: Date.parse(next.ends_at),
            ignoreId: id,
          });
        }
        Object.assign(row, next);
        syncCustomerStats(d, row.customer_id);
        return decorate(d, row);
      }),

      remove: (id) => tx((d) => {
        const row = d.appointments.find((a) => a.id === id);
        d.appointments = d.appointments.filter((a) => a.id !== id);
        if (row) syncCustomerStats(d, row.customer_id);
      }),

      stats: () => read((d) => buildStats(d)),
    },

    booking: {
      slots: ({ barberId, serviceId, date, ignoreAppointmentId = null, ignoreLeadTime = false }) =>
        read((d) => computeSlots(d, { barberId, serviceId, date, ignoreAppointmentId, ignoreLeadTime })),

      // Any barber, one day — powers "first available".
      slotsAll: ({ serviceId, date }) => read((d) => {
        const out = {};
        for (const b of d.barbers.filter((x) => x.is_active && !x.on_vacation)) {
          out[b.id] = computeSlots(d, { barberId: b.id, serviceId, date });
        }
        return out;
      }),

      days: ({ barberId, serviceId, from, count }) => read((d) => {
        const out = {};
        for (let i = 0; i < count; i += 1) {
          const ymd = addDays(from, i);
          const barbers = barberId
            ? [barberId]
            : d.barbers.filter((b) => b.is_active && !b.on_vacation).map((b) => b.id);
          out[ymd] = barbers.some((id) => computeSlots(d, { barberId: id, serviceId, date: ymd }).length > 0);
        }
        return out;
      }),

      create: ({ serviceId, barberId, startsAt, name, phone, email, notes = '' }) => tx((d) => {
        validateBooking({ name, phone, email });
        const service = d.services.find((s) => s.id === serviceId && s.is_active);
        if (!service) fail('That service is no longer available');

        const date = new Intl.DateTimeFormat('en-CA', {
          timeZone: d.settings.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date(startsAt));

        const free = computeSlots(d, { barberId, serviceId, date })
          .some((s) => Date.parse(s.slot_start) === Date.parse(startsAt));
        if (!free) fail('That time has just been taken. Please pick another slot.');

        const customer = upsertCustomer(d, { name, phone, email, barberId });
        const start = Date.parse(startsAt);
        const end = start + service.duration_minutes * 60000;
        const row = {
          id: uid(), reference: nextRef(d), customer_id: customer.id, barber_id: barberId,
          service_id: serviceId, starts_at: new Date(start).toISOString(),
          ends_at: new Date(end).toISOString(),
          status: d.settings.auto_confirm ? 'confirmed' : 'pending',
          price_cents: service.price_cents, notes: String(notes).slice(0, 500),
          is_walk_in: false, created_at: new Date().toISOString(),
        };
        d.appointments.push(row);
        return {
          id: row.id, reference: row.reference, starts_at: row.starts_at, ends_at: row.ends_at,
          status: row.status, service: service.name, price_cents: row.price_cents,
          barber: d.barbers.find((b) => b.id === barberId)?.name, customer_name: customer.name,
        };
      }),

      lookup: (ref, phone) => read((d) => {
        const key = digits(phone);
        const row = d.appointments.find((a) => {
          const c = d.customers.find((x) => x.id === a.customer_id);
          return a.reference.toUpperCase() === String(ref).trim().toUpperCase()
            && c && digits(c.phone) === key;
        });
        if (!row) return null;
        const c = d.customers.find((x) => x.id === row.customer_id);
        const s = d.services.find((x) => x.id === row.service_id);
        const b = d.barbers.find((x) => x.id === row.barber_id);
        return {
          reference: row.reference, status: row.status, starts_at: row.starts_at,
          ends_at: row.ends_at, price_cents: row.price_cents, notes: row.notes,
          service: s?.name, duration_minutes: s?.duration_minutes,
          barber: b?.name, barber_photo: b?.photo_url,
          customer_name: c?.name, customer_phone: c?.phone, customer_email: c?.email,
        };
      }),

      cancel: (ref, phone) => tx((d) => {
        const key = digits(phone);
        const row = d.appointments.find((a) => {
          const c = d.customers.find((x) => x.id === a.customer_id);
          return a.reference.toUpperCase() === String(ref).trim().toUpperCase()
            && c && digits(c.phone) === key
            && ['pending', 'confirmed'].includes(a.status)
            && Date.parse(a.starts_at) > Date.now();
        });
        if (!row) fail('No cancellable booking found for those details');
        row.status = 'cancelled';
        return { cancelled: true };
      }),
    },

    storage: {
      // No bucket in demo mode: the image becomes a data URI in localStorage.
      upload: async (dataUrl) => dataUrl,
    },
  };
}

/* ----------------------------------------------------------------- stats -- */

export function buildStats(d) {
  const tz = d.settings.timezone;
  const today = todayIn(tz);
  const dayStart = zonedToInstant(today, '00:00', tz).toISOString();
  const dayEnd = zonedToInstant(addDays(today, 1), '00:00', tz).toISOString();
  const weekStart = zonedToInstant(addDays(today, -6), '00:00', tz).toISOString();
  const monthStart = zonedToInstant(addDays(today, -29), '00:00', tz).toISOString();
  const prevMonthStart = zonedToInstant(addDays(today, -59), '00:00', tz).toISOString();
  const now = new Date().toISOString();

  const live = (a) => a.status !== 'cancelled';
  const done = (a) => a.status === 'completed';
  const inRange = (a, from, to) => a.starts_at >= from && a.starts_at < to;

  const todays = d.appointments.filter((a) => inRange(a, dayStart, dayEnd) && live(a));
  const revenueToday = todays.filter(done).reduce((s, a) => s + a.price_cents, 0);
  const bookedToday = todays.reduce((s, a) => s + a.price_cents, 0);
  const revenueWeek = d.appointments.filter((a) => inRange(a, weekStart, dayEnd) && done(a))
    .reduce((s, a) => s + a.price_cents, 0);
  const revenueMonth = d.appointments.filter((a) => inRange(a, monthStart, dayEnd) && done(a))
    .reduce((s, a) => s + a.price_cents, 0);
  const revenuePrev = d.appointments.filter((a) => inRange(a, prevMonthStart, monthStart) && done(a))
    .reduce((s, a) => s + a.price_cents, 0);

  const completed = d.appointments.filter(done);
  const newCustomers = d.customers.filter((c) => c.created_at >= monthStart).length;
  const returning = d.customers.filter((c) => c.visit_count > 1).length;

  // Revenue for the last 14 days, for the sparkline.
  const series = [];
  for (let i = 13; i >= 0; i -= 1) {
    const ymd = addDays(today, -i);
    const from = zonedToInstant(ymd, '00:00', tz).toISOString();
    const to = zonedToInstant(addDays(ymd, 1), '00:00', tz).toISOString();
    series.push({
      date: ymd,
      revenue: d.appointments.filter((a) => inRange(a, from, to) && done(a))
        .reduce((s, a) => s + a.price_cents, 0),
      count: d.appointments.filter((a) => inRange(a, from, to) && live(a)).length,
    });
  }

  const byBarber = d.barbers.map((b) => {
    const rows = d.appointments.filter((a) => a.barber_id === b.id && inRange(a, monthStart, dayEnd) && done(a));
    return {
      id: b.id, name: b.name,
      count: rows.length,
      revenue: rows.reduce((s, a) => s + a.price_cents, 0),
    };
  }).sort((a, b) => b.revenue - a.revenue);

  const byService = d.services.map((s) => {
    const rows = d.appointments.filter((a) => a.service_id === s.id && inRange(a, monthStart, dayEnd) && live(a));
    return { id: s.id, name: s.name, count: rows.length };
  }).sort((a, b) => b.count - a.count).slice(0, 5);

  return {
    today: {
      total: todays.length,
      completed: todays.filter(done).length,
      remaining: todays.filter((a) => a.starts_at >= now && a.status !== 'completed').length,
      revenue: revenueToday,
      booked: bookedToday,
    },
    pending: d.appointments.filter((a) => a.status === 'pending' && a.starts_at >= dayStart).length,
    upcoming: d.appointments.filter((a) => a.starts_at >= now && live(a)).length,
    revenue: {
      today: revenueToday,
      week: revenueWeek,
      month: revenueMonth,
      previousMonth: revenuePrev,
      averageTicket: completed.length
        ? Math.round(completed.reduce((s, a) => s + a.price_cents, 0) / completed.length) : 0,
      lifetime: completed.reduce((s, a) => s + a.price_cents, 0),
    },
    customers: {
      total: d.customers.length,
      new30: newCustomers,
      returning,
      returnRate: d.customers.length ? Math.round((returning / d.customers.length) * 100) : 0,
    },
    noShowRate: (() => {
      const past = d.appointments.filter((a) => a.starts_at < now && a.status !== 'cancelled');
      return past.length
        ? Math.round((past.filter((a) => a.status === 'no_show').length / past.length) * 100) : 0;
    })(),
    series,
    byBarber,
    byService,
  };
}
