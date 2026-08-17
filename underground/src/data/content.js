/* ═══════════════════════════════════════════════════════════════════
   EVERY WORD ON THE SITE LIVES IN THIS FILE.
   ═══════════════════════════════════════════════════════════════════

   Each fact carries a `src` so the owner can see where it came from:

     'owner'   given directly by the person commissioning this site,
               reading off Underground's own website
     'listed'  from a public delivery listing (Deliveroo, Talabat,
               Zomato, Yalah). Almost certainly right, but it is not
               the business speaking
     'todo'    NOT KNOWN. A slot waiting to be filled, never invented

   ═══════════════════════════════════════════════════════════════════
   PRICES — the one thing this file does not have
   ═══════════════════════════════════════════════════════════════════

   undergroundcafe.ae could not be reached from the machine this was
   built on: the network policy blocks the domain outright, on every
   attempt. No published price for any item could be sourced anywhere
   else either.

   So there are no prices on this page. Not one is guessed. Every item
   carries a `price: null` that renders as nothing today and renders as
   `AED 42` the moment a number is put in it — the menu layout already
   has the column, the type and the alignment for it.

   This is the single most important thing to fix before the site is
   shown to a customer, and it is a fifteen-minute job with the real
   menu in hand: fill in `price` and `desc` below.

   There are no reviews, ratings, awards or invented history anywhere
   in this file.
   ═══════════════════════════════════════════════════════════════════ */

export const OFFICIAL_URL = 'https://undergroundcafe.ae/'

/** Photos go in `public/photos/`; see that folder's README. */
export const photo = (file) => (file ? `./photos/${file}` : null)

export const brand = {
  name: 'UNDERGROUND',
  full: 'Underground Cafe',
  sub: 'CAFE • DUBAI',
  tagline: 'British comfort food, surrounded by a little bit of green.',
  strap: 'British comfort food • Dubai',
  official: OFFICIAL_URL,
}

export const business = {
  // src: owner
  address: {
    line1: 'One Residence — Shop 3',
    line2: 'Wadi Al Safa 3',
    line3: 'Majan, Dubai',
    src: 'owner',
  },
  // src: listed
  phone: { display: '+971 55 645 8145', tel: '+971556458145', src: 'listed' },
  // src: listed — 12:00 to 01:00, every day
  hours: {
    summary: 'Every day · 12:00 — 01:00',
    rows: [
      { days: 'Monday — Thursday', time: '12:00 — 01:00' },
      { days: 'Friday — Sunday', time: '12:00 — 01:00' },
    ],
    src: 'listed',
  },
  social: [
    { label: 'Instagram', handle: '@undergroundcafe.ae', href: 'https://www.instagram.com/undergroundcafe.ae/', src: 'listed' },
  ],
  order: [
    { label: 'Deliveroo', href: 'https://deliveroo.ae/menu/dubai/al-barari/underground-cafe' },
    { label: 'Talabat', href: 'https://www.talabat.com/uae/restaurant/755736/underground-cafe-majan' },
  ],
  // A search link rather than a pinned coordinate: it resolves correctly
  // from any device and cannot go stale the way a hardcoded lat/lng can.
  maps: 'https://www.google.com/maps/search/?api=1&query=Underground+Cafe+One+Residence+Wadi+Al+Safa+3+Majan+Dubai',
  directions: 'https://www.google.com/maps/dir/?api=1&destination=Underground+Cafe+One+Residence+Wadi+Al+Safa+3+Majan+Dubai',
}

export const nav = [
  { label: 'Home', href: '#top' },
  { label: 'Menu', href: '#menu' },
  { label: 'Our Story', href: '#story' },
  { label: 'Gallery', href: '#gallery' },
  { label: 'Visit Us', href: '#visit' },
]

export const hero = {
  scrollHint: 'SCROLL',
  standfirst:
    'An English kitchen in Majan, open from noon until one in the morning. ' +
    'Breakfast served all day, the pizza base made fresh, and a doner in ' +
    'bread rolled from the same dough.',
}

export const marquee = [
  'BRITISH COMFORT FOOD',
  'MAJAN · DUBAI',
  'OPEN UNTIL 01:00',
  'BREAKFAST ALL DAY',
  'DINE IN · DELIVERY',
]

export const story = {
  eyebrow: 'OUR STORY',
  photo: null,
  photoAlt: '',
  title: 'A British kitchen with the doors open.',
  /* Descriptive, not promotional, and every clause is checkable against
     the place itself. No founding myth: the real one is not published
     anywhere, and inventing one is the fastest way to get caught out. */
  body: [
    'Underground is an English kitchen on the ground floor of One Residence, ' +
      'out in Majan. The menu is the food people actually miss — a full ' +
      'breakfast, fish and chips, a cottage pie, a crumble after it — cooked ' +
      'properly and served all day rather than in a two-hour window.',
    'The pizza base is made fresh and the doner comes in bread rolled from ' +
      'that same dough, which is the sort of detail a kitchen only bothers ' +
      'with if somebody in the back cares. It stays open until one in the ' +
      'morning, seven days a week.',
  ],
  pull: 'A full English at eleven at night is a legitimate position.',
  stats: [
    { k: 'KITCHEN', v: 'British', note: 'Breakfast served all day', src: 'owner' },
    { k: 'WHERE', v: 'Majan', note: 'One Residence, Shop 3', src: 'owner' },
    { k: 'OPEN', v: 'Til 01:00', note: 'Seven days a week', src: 'listed' },
    { k: 'ALSO', v: 'Delivery', note: 'Deliveroo & Talabat', src: 'listed' },
  ],
}

/* ═══════════════════════════════════════════════════════════════════
   MENU

   Item names are real: they come from the brief, read off Underground's
   own site, or from its public delivery listings. Descriptions appear
   only where one could be sourced — the rest are left empty rather than
   written, because a description is a claim about what is on the plate.

   The official menu carries more categories than are shown here
   (Sides, Salads, Kids, Bakery, Healthy Line, British Drinks among
   them). Only categories with real item names are built out; the note
   under the menu points at the full list.
   ═══════════════════════════════════════════════════════════════════ */

export const menu = {
  eyebrow: 'THE MENU',
  title: 'The food you actually miss.',
  note:
    'Item names come from Underground’s own menu. Prices are not shown here ' +
    'yet — see the official menu for current pricing.',
  cta: 'EXPLORE FULL MENU',
  fullList:
    'The full menu also runs Sides, Salads, Kids, Bakery, British Drinks and ' +
    'a Healthy Line.',
  categories: [
    {
      id: 'breakfast',
      label: 'Breakfast',
      caption: 'Served from open until close. Breakfast at nine in the evening is the whole point.',
      items: [
        {
          name: 'Full English Breakfast',
          desc: 'Two toast, two eggs, two sausages, two beef bacon, hash brown or chips, grilled tomato, mushrooms and baked beans.',
          art: 'english', photo: null, price: null, src: 'listed', signature: true,
        },
      ],
    },
    {
      id: 'mains',
      label: 'Mains',
      caption: 'The comfort half of the kitchen, and the reason most people come back.',
      items: [
        { name: 'Fish & Chips', desc: '', art: 'fishchips', photo: null, price: null, src: 'owner', signature: true },
        { name: 'Cottage Pie', desc: '', art: 'cottagepie', photo: null, price: null, src: 'owner', signature: true },
        { name: 'Doner on Chips', desc: '', art: 'doneronchips', photo: null, price: null, src: 'owner' },
        { name: 'Jacket Potato', desc: '', art: 'jacket', photo: null, price: null, src: 'owner' },
      ],
    },
    {
      id: 'burgers',
      label: 'Burgers',
      caption: 'Off the grill, in a bun, with chips on the side.',
      items: [
        { name: 'Underground Heat Burger', desc: '', art: 'burgerHeat', photo: null, price: null, src: 'owner', signature: true },
        { name: 'Doner Burger', desc: '', art: 'burgerDoner', photo: null, price: null, src: 'owner' },
        {
          name: 'Beef & Cheddar Burger',
          desc: 'Beef patty with Cheddar cheese.',
          art: 'burger', photo: null, price: null, src: 'listed',
        },
      ],
    },
    {
      id: 'pizza',
      label: 'Pizza',
      caption: 'The base is made fresh, which is why it takes a few minutes longer.',
      items: [
        { name: 'Tandoori Pizza', desc: '', art: 'pizzaTandoori', photo: null, price: null, src: 'owner', signature: true },
        {
          name: 'Underground Chicken Pizza',
          desc: 'Freshly made base, special Underground garlic sauce, cheese, chicken, sweetcorn, peppers, black olives and onions.',
          art: 'pizza', photo: null, price: null, src: 'listed',
        },
      ],
    },
    {
      id: 'wraps',
      label: 'Subs & Wraps',
      caption: 'The late half of the menu, and what the kitchen is known for.',
      items: [
        {
          name: 'Lamb Doner',
          desc: 'Cabbage, lettuce, tomato and cucumber with garlic sauce and minty chilli sauce, in signature pitta-style bread made from pizza dough.',
          art: 'doner', photo: null, price: null, src: 'listed', signature: true,
        },
      ],
    },
    {
      id: 'desserts',
      label: 'Desserts',
      caption: 'The part of a British menu nobody else in Dubai bothers to get right.',
      items: [
        { name: 'Apple Crumble', desc: '', art: 'crumble', photo: null, price: null, src: 'owner', signature: true },
        { name: 'School Dinner Cake with Custard', desc: '', art: 'cakecustard', photo: null, price: null, src: 'owner', signature: true },
      ],
    },
  ],
}

/* The editorial band. Four dishes the kitchen is known for, pulled from
   the menu above so there is one source for a dish name, not two. */
export const classics = {
  eyebrow: 'THE UNDERGROUND CLASSICS',
  title: 'Four things worth the drive to Majan.',
  picks: ['Full English Breakfast', 'Fish & Chips', 'Lamb Doner', 'Apple Crumble'],
}

export const escape = {
  line1: 'A LITTLE ESCAPE.',
  line2: 'RIGHT HERE IN DUBAI.',
  body:
    'Shade, a fan, a plate of something familiar, and nobody hurrying you ' +
    'back out into the heat.',
}

/* The drinks section names no drinks, deliberately. The menu carries
   Hot Drinks, Cold Drinks and British Drinks, but not one individual
   drink could be sourced by name, and the brief was explicit that
   examples go in only if verified. So the section sells the counter
   rather than a list, and the button goes to the real menu. */
export const drinks = {
  eyebrow: 'COFFEE • TEA • COLD DRINKS',
  title: 'Something cold, in the shade.',
  body:
    'Hot drinks, cold drinks and a British drinks list run alongside the ' +
    'kitchen all day. The full list is on the official menu.',
  cta: 'SEE THE DRINKS MENU',
  arts: ['icedlatte', 'flatwhite', 'lemonade'],
}

export const gallery = {
  eyebrow: 'THE PLACE',
  title: 'Green, shade, and somewhere to sit.',
  note:
    'Every image on this page is drawn in code — no photograph of Underground ' +
    'is used. Each one is a slot waiting for the real picture.',
  shots: [
    { art: 'gal-terrace', photo: null, caption: 'The terrace, mid-afternoon', span: 'wide' },
    { art: 'gal-leaves', photo: null, caption: 'Sun through the canopy', span: 'tall' },
    { art: 'gal-counter', photo: null, caption: 'The counter, planted end to end', span: 'std' },
    { art: 'gal-seat', photo: null, caption: 'Rattan, and room to stay a while', span: 'std' },
    { art: 'gal-window', photo: null, caption: 'The arch, looking out', span: 'wide' },
    { art: 'gal-detail', photo: null, caption: 'A fern nobody is allowed to move', span: 'std' },
  ],
}

export const visit = {
  eyebrow: 'VISIT US',
  title: 'Majan, Dubai.',
  body:
    'Ground floor of One Residence, on the Majan side of Dubai Silicon Oasis. ' +
    'Dine in until one in the morning, or order through Deliveroo and Talabat.',
}

export const contact = {
  title: 'Come and sit in the green.',
  line: 'One Residence — Shop 3 · Wadi Al Safa 3 · Majan, Dubai · Daily until 01:00',
}

export const footer = {
  colophon:
    'An independent design concept for Underground Cafe, Majan. Not affiliated ' +
    'with, endorsed by, or produced for the business. Every image is generated ' +
    'in code, and no prices are shown — see the official site for the current menu.',
}
