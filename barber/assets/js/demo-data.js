/* ==========================================================================
   Demo dataset — the same content as supabase/seed.sql, plus a few weeks of
   plausible appointment history so the dashboard has something to show.

   Only used when no Supabase credentials are configured.
   ========================================================================== */

import { addDays, todayIn, zonedToInstant, weekdayOf } from './time.js';

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/* A small deterministic PRNG, so a fresh install always seeds the same
   history and screenshots do not drift between reloads. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function reference(rand = Math.random) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) out += alphabet[Math.floor(rand() * alphabet.length)];
  return out;
}

/* -------------------------------------------------------------- gallery -- */

const PLATES = [
  ['18,20,28', '122,88,58', 'Chair one, Thursday evening', 'Warm light over the front chair'],
  ['26,22,20', '168,124,74', 'Skin fade, blended by hand', 'Close crop of a finished fade'],
  ['16,24,32', '78,104,132', 'The straight razor pass', 'A razor and towel on the counter'],
  ['24,18,26', '140,90,120', 'Beard oil and a cold towel', 'Finishing a beard sculpt'],
  ['20,26,22', '92,132,96', 'Sunday light on the mirrors', 'The mirror wall in daylight'],
  ['28,24,18', '176,138,70', 'Brass, leather, forty years', 'Detail of the barber chair'],
  ['18,18,24', '104,96,150', 'Late appointment, last chair', 'The shop after dark'],
  ['22,20,20', '150,110,88', 'Textured crop, air-dried', 'A finished textured cut'],
];

/** An abstract plate as an inline SVG data URI — a finished-looking gallery
 *  with no image files and no network requests. */
export function plate(from, to, i = 1, w = 600, h = 750) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}'>`
    + `<defs><linearGradient id='g' x1='0' y1='0' x2='0.7' y2='1'>`
    + `<stop offset='0' stop-color='rgb(${from})'/><stop offset='1' stop-color='rgb(${to})'/>`
    + `</linearGradient><radialGradient id='h' cx='0.32' cy='0.26' r='0.75'>`
    + `<stop offset='0' stop-color='rgba(255,244,222,0.42)'/>`
    + `<stop offset='1' stop-color='rgba(255,244,222,0)'/></radialGradient></defs>`
    + `<rect width='${w}' height='${h}' fill='url(%23g)'/>`
    + `<rect width='${w}' height='${h}' fill='url(%23h)'/>`
    + `<g fill='none' stroke='rgba(255,255,255,0.16)' stroke-width='1.5'>`
    + `<circle cx='${w / 2}' cy='${h * 0.44}' r='${90 + i * 9}'/>`
    + `<circle cx='${w / 2}' cy='${h * 0.44}' r='${150 + i * 13}'/></g>`
    + `<rect x='0' y='${h * 0.7 + i * 8}' width='${w}' height='2' fill='rgba(255,255,255,0.10)'/>`
    + `</svg>`;
  return `data:image/svg+xml;utf8,${svg}`;
}

/* -------------------------------------------------------------- dataset -- */

export function buildDemoData() {
  const rand = rng(20260214);
  const tz = 'Europe/Amsterdam';
  const today = todayIn(tz);

  const settings = {
    id: 1,
    timezone: tz,
    currency: 'EUR',
    currency_symbol: '€',
    booking_interval_minutes: 15,
    default_duration_minutes: 30,
    buffer_minutes: 0,
    lead_time_minutes: 60,
    max_advance_days: 60,
    auto_confirm: false,
  };

  const services = [
    ['Signature Cut', 'signature-cut', "A consultation, a precision cut worked to your hair's natural fall, hot towel and finish.", 3800, 45, 'scissors', true],
    ['Skin Fade', 'skin-fade', 'Clipper work taken down to the skin and blended by hand, with a razored outline.', 4200, 45, 'fade', true],
    ['Beard Sculpt', 'beard-sculpt', 'Shape, line-up and condition. Finished with warm oil and a cold towel.', 2500, 30, 'beard', false],
    ['Cut & Beard', 'cut-and-beard', 'The Signature Cut and a full beard sculpt in one sitting. Our most-booked appointment.', 5800, 75, 'star', true],
    ['Hot Towel Shave', 'hot-towel-shave', 'Three towels, pre-shave oil, a straight razor pass with the grain and one against.', 3500, 45, 'razor', false],
    ['The Quick One', 'the-quick-one', 'Neck, edges and a tidy between appointments. In and out on your lunch break.', 1800, 20, 'clock', false],
    ['Junior Cut', 'junior-cut', 'For under-12s. Same care, smaller chair, and a lot more patience.', 2200, 30, 'child', false],
  ].map(([name, slug, description, price_cents, duration_minutes, icon, is_featured], i) => ({
    id: uid(), name, slug, description, price_cents, duration_minutes, icon,
    is_featured, is_active: true, sort_order: i + 1,
  }));

  const barbers = [
    ['Marco Ricci', 'Master Barber & Owner',
      'Twenty-two years behind the chair, eleven of them running this one. Marco trained in Milan on scissor-over-comb and still cuts most of the shop’s classic work himself.',
      ['Scissor work', 'Classic cuts', 'Hot towel shaves'], '@marco.fadeco'],
    ['Amir Haddad', 'Senior Barber',
      'The person to see about a fade. Amir competes in barbering championships and brings that precision to a Tuesday afternoon appointment.',
      ['Skin fades', 'Beard sculpting', 'Line-ups'], '@amircuts'],
    ['Jonah Bell', 'Barber',
      'Textured, lived-in cuts for hair that refuses to sit still. Jonah works mostly with curls and coils and is unusually good at explaining what to do at home.',
      ['Curly hair', 'Texture', 'Modern cuts'], '@jonah.bell'],
    ['Sofia Marin', 'Barber & Colourist',
      'Sofia came to barbering from salon colour work, which is why the greys and the grow-outs in this shop look deliberate.',
      ['Colour', 'Scissor work', 'Junior cuts'], '@sofiamarin'],
  ].map(([name, title, bio, specialties, instagram], i) => ({
    id: uid(), name, title, bio, specialties, instagram,
    photo_url: null, is_active: true, on_vacation: false, vacation_note: '',
    sort_order: i + 1,
  }));

  const schedules = [
    [0, true, '10:00', '16:00', null, null],
    [1, false, '09:00', '18:00', '13:00', '13:30'],
    [2, false, '09:00', '18:00', '13:00', '13:30'],
    [3, false, '09:00', '20:00', '13:00', '13:30'],
    [4, false, '09:00', '20:00', '13:00', '13:30'],
    [5, false, '09:00', '20:00', '13:00', '13:30'],
    [6, false, '09:00', '17:00', null, null],
  ].map(([weekday, is_closed, opens_at, closes_at, break_start, break_end]) => ({
    id: uid(), barber_id: null, weekday, is_closed, opens_at, closes_at, break_start, break_end,
  }));

  const gallery = PLATES.map(([from, to, caption, alt_text], i) => ({
    id: uid(), image_url: plate(from, to, i + 1), caption, alt_text,
    sort_order: i + 1, is_visible: true,
  }));

  const reviews = [
    ['Daniel W.', 'Customer since 2019', 'I have had the same cut for six years and it has never once been wrong. Booking used to mean phoning at the wrong moment; now it takes about forty seconds.'],
    ['Priya S.', 'Books the Cut & Beard', 'Amir asked what I actually do with my hair in the morning before he picked up the clippers. Nobody had done that before.'],
    ['Tomas L.', 'Walk-in turned regular', 'Came in on a Saturday with no appointment expecting to be turned away. Sat down, coffee, twenty minutes, best fade I have had.'],
    ['Ruth A.', 'Brings both her sons', 'Sofia cuts my boys’ hair and somehow makes an eight year old sit still. Worth the price on its own.'],
    ['Kwame O.', 'Customer since 2021', 'Jonah is the first barber who did not try to cut my curls like they were straight hair. It grows out well, which is the real test.'],
  ].map(([author_name, author_role, body], i) => ({
    id: uid(), author_name, author_role, body, rating: 5,
    barber_id: null, is_published: true, sort_order: i + 1,
  }));

  const website_content = {
    business: { name: 'Fade & Co', tagline: 'Barbering, Amsterdam', logo_mark: 'F' },
    hero: {
      eyebrow: 'Est. 2011 · Jordaan',
      title: 'A cut worth the walk across town.',
      subtitle: 'Four barbers, one chair each, and appointments that start when they say they will. Book in under a minute.',
      primary_cta: 'Book an appointment',
      secondary_cta: 'See our services',
      stat_one_value: '12k+', stat_one_label: 'Cuts a year',
      stat_two_value: '4.9', stat_two_label: 'Average rating',
      stat_three_value: '22', stat_three_label: 'Years on this street',
    },
    about: {
      title: 'We only do one thing.',
      body: "Fade & Co opened in 2011 in a former ironmonger’s on the Jordaan, and we have resisted every suggestion to add a spa menu since. There are four chairs, four barbers, good coffee and a record player that is usually on. Everything else is haircuts.\n\nNobody is rushed out. An appointment is booked for the time your cut actually takes, which is why the schedule holds and why the person before you is not still in the chair when you arrive.",
      quote: 'If it is not right, it goes back on the comb. There is no version of this where you leave unhappy.',
      quote_author: 'Marco Ricci, owner',
    },
    contact: {
      title: 'Find us',
      subtitle: 'Two minutes from Westermarkt, on the canal side.',
      address_line1: 'Prinsengracht 214',
      address_line2: '1016 HD Amsterdam',
      phone: '+31 20 555 0142',
      email: 'hello@fadeandco.nl',
      map_query: 'Prinsengracht 214, 1016 HD Amsterdam',
      map_lat: 52.3752, map_lng: 4.8836,
      directions_note: 'Tram 13 or 17 to Westermarkt. Bike racks directly outside; there is no parking on the gracht.',
    },
    social: { instagram: 'https://instagram.com/', facebook: 'https://facebook.com/', tiktok: '', whatsapp: '' },
    faq: {
      items: [
        { q: 'Do you take walk-ins?', a: 'When a chair is free, yes. Saturdays are almost always fully booked by Thursday, so an appointment is the safer plan.' },
        { q: 'What if I need to cancel?', a: 'Cancel from the link in your confirmation, or call us. We ask for four hours’ notice so the slot can go to someone else.' },
        { q: 'How do I pick between the barbers?', a: 'Any of them will cut you well. If you want something specific — a skin fade, curls, colour — the specialities on each profile are honest, not marketing.' },
        { q: 'Can I book for someone else?', a: 'Yes. Put their name and your phone number, and add a note so we know who to expect.' },
        { q: 'How should I pay?', a: 'Card, cash or contactless in the shop. Nothing is taken online, and there is no deposit.' },
        { q: 'I am running late.', a: 'Call. We can usually hold a chair ten minutes; past that it depends on who is booked after you.' },
      ],
    },
    footer: {
      blurb: 'Fade & Co has cut hair on the Prinsengracht since 2011.',
      note: 'Appointments open 60 days ahead.',
      legal: '© Fade & Co. All rights reserved.',
    },
  };

  /* ---- customers and appointment history ---- */

  const NAMES = [
    'Daniel Weerman', 'Priya Sharma', 'Tomas Lindqvist', 'Ruth Adeyemi', 'Kwame Osei',
    'Lotte de Vries', 'Ibrahim Yilmaz', 'Sanne Bakker', 'Marek Nowak', 'Aisha Rahman',
    'Finn O’Connor', 'Chiara Rossi', 'Youssef Benali', 'Emma Janssen', 'Nico Duarte',
    'Hannah Klein', 'Rafael Costa', 'Mei Lin', 'Oskar Hoffmann', 'Zara Malik',
    'Pieter Smit', 'Nadia Fischer', 'Julian Mercer', 'Ayla Demir',
  ];

  const customers = NAMES.map((name, i) => ({
    id: uid(),
    name,
    phone: `+31 6 ${String(10000000 + Math.floor(rand() * 89999999)).slice(0, 8)}`,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
    notes: i === 2 ? 'Prefers scissors only, no clippers on top.'
      : i === 7 ? 'Allergic to the sandalwood tonic — use the unscented one.' : '',
    favorite_barber_id: barbers[i % barbers.length].id,
    visit_count: 0,
    total_spend_cents: 0,
    last_visit_at: null,
    created_at: new Date(Date.now() - (400 - i * 9) * 86400000).toISOString(),
  }));

  const appointments = [];
  const taken = new Map(); // barber_id -> [[start, end], …]

  const fits = (barberId, start, end) => {
    const list = taken.get(barberId) || [];
    const ok = list.every(([s, e]) => end <= s || start >= e);
    if (ok) list.push([start, end]);
    taken.set(barberId, list);
    return ok;
  };

  const book = (ymd, hm, barber, service, customer, status, isWalkIn = false) => {
    const start = zonedToInstant(ymd, hm, tz);
    const end = new Date(start.getTime() + service.duration_minutes * 60000);
    if (!fits(barber.id, start.getTime(), end.getTime())) return null;
    const row = {
      id: uid(),
      reference: reference(rand),
      customer_id: customer.id,
      barber_id: barber.id,
      service_id: service.id,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      status,
      price_cents: service.price_cents,
      notes: '',
      is_walk_in: isWalkIn,
      created_at: new Date(start.getTime() - (2 + rand() * 200) * 3600000).toISOString(),
    };
    appointments.push(row);
    return row;
  };

  const HOURS = ['09:00', '09:45', '10:30', '11:15', '12:00', '14:00', '14:45', '15:30', '16:15', '17:00', '17:45', '18:30'];

  for (let offset = -45; offset <= 20; offset += 1) {
    const ymd = addDays(today, offset);
    const dow = weekdayOf(ymd);
    const sched = schedules.find((s) => s.weekday === dow);
    if (sched.is_closed) continue;

    // Busier towards the weekend, quieter in the future than in the past.
    const density = (dow === 5 || dow === 6 ? 0.72 : 0.46) * (offset > 0 ? 0.62 : 1);

    for (const barber of barbers) {
      for (const hm of HOURS) {
        if (rand() > density) continue;
        if (hm >= sched.closes_at) continue;
        const service = services[Math.floor(rand() * 5)];
        const customer = customers[Math.floor(rand() * customers.length)];
        let status;
        if (offset < 0) status = rand() < 0.08 ? 'cancelled' : rand() < 0.05 ? 'no_show' : 'completed';
        else if (offset === 0) status = hm < '13:00' ? 'completed' : rand() < 0.7 ? 'confirmed' : 'pending';
        else status = rand() < 0.62 ? 'confirmed' : 'pending';
        book(ymd, hm, barber, service, customer, status, offset <= 0 && rand() < 0.12);
      }
    }
  }

  // Recompute the stats the database keeps in sync with a trigger.
  for (const c of customers) {
    const done = appointments.filter((a) => a.customer_id === c.id && a.status === 'completed');
    c.visit_count = done.length;
    c.total_spend_cents = done.reduce((sum, a) => sum + a.price_cents, 0);
    c.last_visit_at = done.length
      ? done.map((a) => a.starts_at).sort().at(-1)
      : null;
  }

  const time_blocks = [
    {
      id: uid(), barber_id: null, kind: 'holiday', reason: 'Staff training day',
      starts_at: zonedToInstant(addDays(today, 12), '00:00', tz).toISOString(),
      ends_at: zonedToInstant(addDays(today, 13), '00:00', tz).toISOString(),
    },
  ];

  return {
    settings, services, barbers, schedules, time_blocks,
    customers, appointments, gallery, reviews, website_content,
    admin: { email: 'admin@fadeandco.nl', password: 'fadeandco' },
  };
}
