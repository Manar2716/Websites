/* ==========================================================================
   Supabase backend

   The production data layer. Reads go straight to PostgREST under row level
   security; the three anonymous write paths are RPCs. Nothing here trusts the
   client — every rule that matters is in schema.sql, and this file would be
   unable to break them even if it tried.
   ========================================================================== */

import { buildStats } from './backend-demo.js';
import { addDays, todayIn } from './time.js';

const APPT_SELECT = `
  id, reference, starts_at, ends_at, status, price_cents, notes, is_walk_in, created_at,
  customer_id, barber_id, service_id,
  customer:customers ( id, name, phone, email, notes, visit_count, total_spend_cents ),
  barber:barbers ( id, name, photo_url, title ),
  service:services ( id, name, duration_minutes, price_cents, icon )
`;

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

const digits = (v) => String(v || '').replace(/\D/g, '');

/** Text search runs over the returned page rather than in SQL: the fields a
 *  user searches by live across three joined tables, and a shop's diary for a
 *  filtered range is small. The server-side filters do the real narrowing. */
function textFilter(rows, search) {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((a) => a.customer?.name?.toLowerCase().includes(q)
    || digits(a.customer?.phone).includes(digits(q) || ' ')
    || (a.customer?.email || '').toLowerCase().includes(q)
    || a.reference.toLowerCase().includes(q)
    || (a.service?.name || '').toLowerCase().includes(q));
}

export async function createSupabaseBackend({ supabaseUrl, supabaseAnonKey, supabaseModule, storageBucket }) {
  const { createClient } = await import(/* @vite-ignore */ supabaseModule);
  const sb = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  const orderBy = (q, all) => (all ? q : q).order('sort_order', { ascending: true });

  const api = {
    isDemo: false,
    client: sb,

    auth: {
      async getSession() {
        const { data } = await sb.auth.getSession();
        return data.session ?? null;
      },
      async signIn(email, password) {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Authenticating is not the same as being the admin. Anyone with a
        // Supabase account could reach this point; only the one row in
        // admin_users gets in, and everyone else is signed straight back out.
        const isAdmin = unwrap(await sb.rpc('is_admin'));
        if (!isAdmin) {
          await sb.auth.signOut();
          throw new Error('This account does not have admin access.');
        }
        return data.session;
      },
      async signOut() {
        const { error } = await sb.auth.signOut();
        if (error) throw error;
      },
      onChange(fn) {
        const { data } = sb.auth.onAuthStateChange((_event, session) => fn(session ?? null));
        return () => data.subscription.unsubscribe();
      },
    },

    settings: {
      get: async () => unwrap(await sb.from('settings').select('*').eq('id', 1).single()),
      update: async (patch) =>
        unwrap(await sb.from('settings').update(patch).eq('id', 1).select().single()),
    },

    content: {
      all: async () => {
        const rows = unwrap(await sb.from('website_content').select('key, value'));
        return Object.fromEntries(rows.map((r) => [r.key, r.value]));
      },
      set: async (key, value) =>
        unwrap(await sb.from('website_content')
          .upsert({ key, value }, { onConflict: 'key' }).select().single()).value,
    },

    services: {
      list: async ({ all = false } = {}) => {
        let q = sb.from('services').select('*');
        if (!all) q = q.eq('is_active', true);
        return unwrap(await orderBy(q, all));
      },
      create: async (row) => unwrap(await sb.from('services').insert(row).select().single()),
      update: async (id, patch) =>
        unwrap(await sb.from('services').update(patch).eq('id', id).select().single()),
      remove: async (id) => { unwrap(await sb.from('services').delete().eq('id', id)); },
      reorder: async (ids) => {
        unwrap(await sb.from('services')
          .upsert(ids.map((id, i) => ({ id, sort_order: i + 1 })), { onConflict: 'id' }));
      },
    },

    barbers: {
      list: async ({ all = false } = {}) => {
        let q = sb.from('barbers').select('*');
        if (!all) q = q.eq('is_active', true);
        return unwrap(await orderBy(q, all));
      },
      create: async (row) => unwrap(await sb.from('barbers').insert(row).select().single()),
      update: async (id, patch) =>
        unwrap(await sb.from('barbers').update(patch).eq('id', id).select().single()),
      remove: async (id) => { unwrap(await sb.from('barbers').delete().eq('id', id)); },
      reorder: async (ids) => {
        unwrap(await sb.from('barbers')
          .upsert(ids.map((id, i) => ({ id, sort_order: i + 1 })), { onConflict: 'id' }));
      },
    },

    schedules: {
      list: async (barberId = null) => {
        let q = sb.from('schedules').select('*');
        q = barberId ? q.eq('barber_id', barberId) : q.is('barber_id', null);
        return unwrap(await q.order('weekday'));
      },
      upsert: async (row) => unwrap(await sb.from('schedules')
        .upsert(row, { onConflict: row.barber_id ? 'barber_id,weekday' : 'weekday' })
        .select().single()),
      clearBarber: async (barberId) => {
        unwrap(await sb.from('schedules').delete().eq('barber_id', barberId));
      },
      listBlocks: async ({ from = null } = {}) => {
        let q = sb.from('time_blocks').select('*, barber:barbers(id, name)');
        if (from) q = q.gte('ends_at', from);
        return unwrap(await q.order('starts_at'));
      },
      createBlock: async (row) => unwrap(await sb.from('time_blocks').insert(row).select().single()),
      removeBlock: async (id) => { unwrap(await sb.from('time_blocks').delete().eq('id', id)); },
    },

    gallery: {
      list: async ({ all = false } = {}) => {
        let q = sb.from('gallery').select('*');
        if (!all) q = q.eq('is_visible', true);
        return unwrap(await orderBy(q, all));
      },
      create: async (row) => unwrap(await sb.from('gallery').insert(row).select().single()),
      update: async (id, patch) =>
        unwrap(await sb.from('gallery').update(patch).eq('id', id).select().single()),
      remove: async (id) => { unwrap(await sb.from('gallery').delete().eq('id', id)); },
      reorder: async (ids) => {
        unwrap(await sb.from('gallery')
          .upsert(ids.map((id, i) => ({ id, sort_order: i + 1 })), { onConflict: 'id' }));
      },
    },

    reviews: {
      list: async ({ all = false } = {}) => {
        let q = sb.from('reviews').select('*');
        if (!all) q = q.eq('is_published', true);
        return unwrap(await orderBy(q, all));
      },
      create: async (row) => unwrap(await sb.from('reviews').insert(row).select().single()),
      update: async (id, patch) =>
        unwrap(await sb.from('reviews').update(patch).eq('id', id).select().single()),
      remove: async (id) => { unwrap(await sb.from('reviews').delete().eq('id', id)); },
      reorder: async (ids) => {
        unwrap(await sb.from('reviews')
          .upsert(ids.map((id, i) => ({ id, sort_order: i + 1 })), { onConflict: 'id' }));
      },
    },

    customers: {
      list: async ({ search = '', limit = 500 } = {}) => {
        let q = sb.from('customers')
          .select('*, favorite_barber:barbers!customers_favorite_barber_id_fkey(id, name)');
        const term = search.trim();
        if (term) {
          const like = `%${term.replace(/[%,]/g, '')}%`;
          q = q.or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`);
        }
        return unwrap(await q.order('last_visit_at', { ascending: false, nullsFirst: false })
          .limit(limit));
      },
      get: async (id) => {
        const customer = unwrap(await sb.from('customers')
          .select('*, favorite_barber:barbers!customers_favorite_barber_id_fkey(id, name)')
          .eq('id', id).single());
        const history = unwrap(await sb.from('appointments').select(APPT_SELECT)
          .eq('customer_id', id).order('starts_at', { ascending: false }).limit(100));
        return { ...customer, history };
      },
      update: async (id, patch) =>
        unwrap(await sb.from('customers').update(patch).eq('id', id).select().single()),
      remove: async (id) => { unwrap(await sb.from('customers').delete().eq('id', id)); },
    },

    appointments: {
      list: async ({ from = null, to = null, status = null, barberId = null, search = '', limit = 400 } = {}) => {
        let q = sb.from('appointments').select(APPT_SELECT);
        if (from) q = q.gte('starts_at', from);
        if (to) q = q.lt('starts_at', to);
        if (status) q = q.eq('status', status);
        if (barberId) q = q.eq('barber_id', barberId);
        const rows = unwrap(await q.order('starts_at').limit(limit));
        return textFilter(rows, search);
      },

      create: async ({ serviceId, barberId, startsAt, name, phone, email, notes = '', status = 'confirmed', isWalkIn = false, priceCents = null }) => {
        const service = unwrap(await sb.from('services')
          .select('duration_minutes, price_cents').eq('id', serviceId).single());
        const start = new Date(startsAt);
        const end = new Date(start.getTime() + service.duration_minutes * 60000);

        // Reuse the customer record when the phone number is already known,
        // so a walk-in joins their own history instead of forking it.
        const key = digits(phone);
        const existing = unwrap(await sb.from('customers').select('id, phone').limit(1000))
          .find((c) => digits(c.phone) === key);

        let customerId = existing?.id;
        if (customerId) {
          unwrap(await sb.from('customers').update({ name, phone, ...(email ? { email } : {}) })
            .eq('id', customerId));
        } else {
          customerId = unwrap(await sb.from('customers')
            .insert({ name, phone, email: email || null, favorite_barber_id: barberId })
            .select('id').single()).id;
        }

        const reference = await uniqueReference(sb);
        return unwrap(await sb.from('appointments').insert({
          reference,
          customer_id: customerId,
          barber_id: barberId,
          service_id: serviceId,
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          status,
          price_cents: priceCents ?? service.price_cents,
          notes,
          is_walk_in: isWalkIn,
        }).select(APPT_SELECT).single());
      },

      update: async (id, patch) => {
        const next = { ...patch };
        if (patch.starts_at || patch.service_id) {
          const current = unwrap(await sb.from('appointments')
            .select('service_id, starts_at').eq('id', id).single());
          const serviceId = patch.service_id ?? current.service_id;
          const service = unwrap(await sb.from('services')
            .select('duration_minutes, price_cents').eq('id', serviceId).single());
          const start = new Date(patch.starts_at ?? current.starts_at);
          next.ends_at = new Date(start.getTime() + service.duration_minutes * 60000).toISOString();
          if (patch.service_id && patch.price_cents === undefined) next.price_cents = service.price_cents;
        }
        return unwrap(await sb.from('appointments').update(next).eq('id', id)
          .select(APPT_SELECT).single());
      },

      remove: async (id) => { unwrap(await sb.from('appointments').delete().eq('id', id)); },

      /* Stats are computed here rather than in SQL because the shape is a
         dashboard, not a report: one round trip for the window that every
         card draws from beats a dozen aggregate queries. */
      stats: async () => {
        const settings = await api.settings.get();
        const today = todayIn(settings.timezone);
        const from = new Date(`${addDays(today, -60)}T00:00:00Z`).toISOString();
        const [appointments, customers, barbers, services] = await Promise.all([
          sb.from('appointments')
            .select('id, starts_at, ends_at, status, price_cents, barber_id, service_id, customer_id')
            .gte('starts_at', from).order('starts_at').limit(5000).then(unwrap),
          sb.from('customers').select('id, created_at, visit_count, total_spend_cents')
            .limit(5000).then(unwrap),
          sb.from('barbers').select('id, name').order('sort_order').then(unwrap),
          sb.from('services').select('id, name').order('sort_order').then(unwrap),
        ]);
        return buildStats({ settings, appointments, customers, barbers, services });
      },
    },

    booking: {
      slots: async ({ barberId, serviceId, date }) => unwrap(await sb.rpc('get_available_slots', {
        p_barber_id: barberId, p_service_id: serviceId, p_date: date,
      })),

      slotsAll: async ({ serviceId, date }) => {
        const rows = unwrap(await sb.rpc('get_available_slots_any', {
          p_service_id: serviceId, p_date: date,
        }));
        const out = {};
        for (const r of rows) {
          (out[r.barber_id] ||= []).push({ slot_start: r.slot_start, slot_end: r.slot_end });
        }
        return out;
      },

      days: async ({ barberId, serviceId, from, count }) => {
        const rows = unwrap(await sb.rpc('get_available_days', {
          p_barber_id: barberId || null, p_service_id: serviceId, p_from: from, p_days: count,
        }));
        return Object.fromEntries(rows.map((r) => [r.day, r.has_slots]));
      },

      create: async ({ serviceId, barberId, startsAt, name, phone, email, notes = '' }) =>
        unwrap(await sb.rpc('create_booking', {
          p_service_id: serviceId,
          p_barber_id: barberId,
          p_starts_at: new Date(startsAt).toISOString(),
          p_name: name,
          p_phone: phone,
          p_email: email || null,
          p_notes: notes,
        })),

      lookup: async (reference, phone) =>
        unwrap(await sb.rpc('get_booking', { p_reference: reference, p_phone: phone })),

      cancel: async (reference, phone) =>
        unwrap(await sb.rpc('cancel_booking', { p_reference: reference, p_phone: phone })),
    },

    storage: {
      /** Uploads a data URL to the public bucket and returns its URL. */
      upload: async (dataUrl, name = 'image') => {
        const blob = await (await fetch(dataUrl)).blob();
        const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
        const path = `${name}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await sb.storage.from(storageBucket)
          .upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
        if (error) throw error;
        return sb.storage.from(storageBucket).getPublicUrl(path).data.publicUrl;
      },
    },
  };

  return api;
}

async function uniqueReference(sb) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let ref = '';
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    for (const b of bytes) ref += alphabet[b % alphabet.length];
    const { data } = await sb.from('appointments').select('id').eq('reference', ref).maybeSingle();
    if (!data) return ref;
  }
  throw new Error('Could not allocate a booking reference. Please try again.');
}
