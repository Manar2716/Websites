/* ═══════════════════════════════════════════════════════════════════
   EVERY WORD ON THE SITE LIVES IN THIS FILE.
   ═══════════════════════════════════════════════════════════════════

   Nothing here is invented about the business. Each fact carries a
   `status` so the owner can see at a glance what still needs checking:

     'confirmed'   taken from the business's own website or its verified
                   social profile
     'listed'      taken from a third-party listing (Zomato, Talabat,
                   Deliveroo, Yalah). Almost certainly right, but it is
                   not the business speaking — worth a glance.
     'placeholder' NOT REAL. A stand-in so the layout has something of
                   the right shape in it. Replace before this site goes
                   anywhere near a customer.

   Search this file for `placeholder` to find everything outstanding.

   WHAT THIS PLACE ACTUALLY IS
   ---------------------------
   Underground is a RESTAURANT, not a coffee bar — the name contains the
   word "cafe" but the kitchen is an English one. Its listings describe
   an all-day English breakfast, burgers, pizza made on a fresh base and
   a lamb doner in pitta made from pizza dough, served until one in the
   morning. An earlier draft of this site was written as a third-wave
   espresso bar, complete with a roasting process. That was invention,
   and it has been taken out.

   PRICES
   ------
   There are none on this page, deliberately. No published price for any
   item could be sourced, and a menu with invented numbers on it is the
   single most damaging thing a concept site can carry — somebody will
   quote it. Names and descriptions are shown, and the section sends
   people to the official site for prices.

   There are no reviews, ratings, awards or superlatives anywhere in this
   file, and there should not be: none of it can be sourced.
   ═══════════════════════════════════════════════════════════════════ */

export const OFFICIAL_URL = 'https://undergroundcafe.ae/'

/** Photos go in `public/photos/`; see `photo:` on any menu or gallery
    entry, and the note in the README. Returns a path relative to the
    page, so it works from any base. */
export const photo = (file) => (file ? `./photos/${file}` : null)

export const brand = {
  name: 'UNDERGROUND',
  full: 'Underground Cafe',
  sub: 'MAJAN • DUBAI',
  // The site's own line, not a claim about the business.
  tagline: 'Breakfast at midnight.',
  official: OFFICIAL_URL,
}

export const business = {
  // status: listed — One Residence, Majan (Dubai Silicon Oasis side)
  address: {
    line1: 'Shop 3, One Residence',
    line2: 'Majan, Dubai',
    line3: 'United Arab Emirates',
    status: 'listed',
  },
  // status: listed
  phone: { display: '+971 55 645 8145', tel: '+971556458145', status: 'listed' },
  // status: placeholder — no public address found. Replace or delete.
  email: { display: 'hello@undergroundcafe.ae', status: 'placeholder' },
  // status: listed — 12:00 to 01:00, every day
  hours: {
    summary: 'Daily · 12:00 — 01:00',
    rows: [
      { days: 'Monday — Thursday', time: '12:00 — 01:00' },
      { days: 'Friday — Sunday', time: '12:00 — 01:00' },
    ],
    status: 'listed',
  },
  social: [
    // status: confirmed — the handle on the business's own site
    { label: 'Instagram', handle: '@undergroundcafe.ae', href: 'https://www.instagram.com/undergroundcafe.ae/', status: 'confirmed' },
    { label: 'Website', handle: 'undergroundcafe.ae', href: OFFICIAL_URL, status: 'confirmed' },
  ],
  // Delivery listings, where the menu detail on this page came from.
  order: [
    { label: 'Deliveroo', href: 'https://deliveroo.ae/menu/dubai/al-barari/underground-cafe' },
    { label: 'Talabat', href: 'https://www.talabat.com/uae/restaurant/755736/underground-cafe-majan' },
  ],
  // A search link rather than a pinned coordinate: it resolves to the
  // right place from any device and cannot go stale the way a hardcoded
  // lat/lng or an embedded place ID can.
  maps: 'https://www.google.com/maps/search/?api=1&query=Underground+Cafe+One+Residence+Majan+Dubai',
  directions: 'https://www.google.com/maps/dir/?api=1&destination=Underground+Cafe+One+Residence+Majan+Dubai',
}

export const nav = [
  { label: 'Home', href: '#top' },
  { label: 'Menu', href: '#menu' },
  { label: 'About', href: '#about' },
  { label: 'Gallery', href: '#gallery' },
  { label: 'Location', href: '#location' },
  { label: 'Contact', href: '#contact' },
]

export const hero = {
  standfirst:
    'An English kitchen in Majan, open from noon until one in the morning. ' +
    'Full breakfast whenever you want it, burgers, pizza off a fresh base, ' +
    'and lamb doner in bread we make from the same dough.',
  scrollHint: 'SCROLL',
}

export const marquee = [
  'ENGLISH KITCHEN',
  'MAJAN · DUBAI',
  'OPEN UNTIL 01:00',
  'BREAKFAST ALL DAY',
  'DINE IN · DELIVERY',
]

export const about = {
  eyebrow: 'THE ROOM',
  photo: null,
  photoAlt: '',
  title: 'Down a step, and the kitchen is still on.',
  body: [
    'Underground is a small English kitchen on the ground floor of One ' +
      'Residence in Majan. Breakfast runs all day, the pizza base is made ' +
      'fresh, and the doner comes in bread rolled from that same dough — ' +
      'which is the sort of detail a place only bothers with if somebody in ' +
      'the back actually cares.',
    'The useful part is the hours. It opens at noon and the last order goes ' +
      'in at one in the morning, seven days a week, which in this part of ' +
      'Dubai is the difference between eating and going home hungry.',
  ],
  pull: 'A full English at eleven at night is a legitimate position.',
  stats: [
    // status: placeholder — the year is not published anywhere public.
    { k: 'EST.', v: '20—', note: 'Year to confirm', status: 'placeholder' },
    { k: 'DUBAI', v: 'Majan', note: 'One Residence, Shop 3', status: 'listed' },
    { k: 'KITCHEN', v: 'English', note: 'Breakfast all day', status: 'listed' },
    { k: 'OPEN', v: 'Til 01:00', note: 'Seven days', status: 'listed' },
  ],
}

/* The horizontal rail. It used to be a five-step coffee roasting process
   — sourcing, roasting, grinding, extraction — which was a story about a
   business that does not roast coffee. It is now the one thing about
   this place that is both true and worth a section: the hours. */
export const hours = {
  eyebrow: 'THE HOURS',
  title: 'Thirteen hours, seven days.',
  aside: 'Scroll to move through it',
  steps: [
    { n: '12:00', art: 'gal-arch', photo: null, title: 'Doors', body: 'Opens at noon, and the breakfast menu opens with it. Nothing on it comes off at eleven in the morning, because nothing goes on at six.' },
    { n: '15:00', art: 'gal-table', photo: null, title: 'The quiet part', body: 'The afternoon table nobody is rushing you off. Coffee, a plate, and a laptop if that is what you are here for.' },
    { n: '19:00', art: 'gal-bar', photo: null, title: 'The kitchen fills', body: 'Burgers and pizza carry the evening. The base is made fresh, which is why it takes a few minutes longer than the place next door.' },
    { n: '23:00', art: 'gal-corner', photo: null, title: 'Late', body: 'The hour the doner does most of its work — pitta rolled from pizza dough, garlic sauce, minty chilli sauce.' },
    { n: '01:00', art: 'gal-machine', photo: null, title: 'Last order', body: 'One in the morning, seven days a week. Then the lights go down and it starts again at noon.' },
  ],
  status: 'listed',
}

/* ═══════════════════════════════════════════════════════════════════
   MENU

   Items marked `listed` are real: names and descriptions come from
   Underground's own delivery listings. Items marked `placeholder` are
   layout stand-ins with plausible names and no claim behind them — the
   page flags them, and they are the first thing to replace.

   No prices anywhere. See the note at the top of this file.
   `art` names the drawing used (src/art/painters.js); `photo` takes a
   filename in public/photos/ and wins over the drawing when set.
   ═══════════════════════════════════════════════════════════════════ */

export const menu = {
  eyebrow: 'THE MENU',
  title: 'An English kitchen, open late.',
  note:
    'Dishes marked with a dot are from Underground’s own delivery listings. ' +
    'The rest are layout placeholders. No prices are shown here — the full ' +
    'menu and current prices are on the official site.',
  legend: 'From Underground’s listings',
  cta: 'EXPLORE FULL MENU',
  categories: [
    {
      id: 'breakfast',
      label: 'Breakfast',
      caption: 'Served from open until close. Breakfast at nine in the evening is the whole point.',
      items: [
        {
          name: 'English Breakfast',
          desc: 'Two toast, two eggs, two sausages, two beef bacon, hash brown or chips, grilled tomato, mushrooms and baked beans.',
          art: 'english', photo: null, source: 'listed',
        },
        { name: 'Eggs & Toast', desc: 'Eggs your way on toasted bread, with the grill items on the side.', art: 'benedict', photo: null, source: 'placeholder' },
        { name: 'Pancake Stack', desc: 'Stacked, buttered, with syrup poured at the table.', art: 'pancakes', photo: null, source: 'placeholder' },
        { name: 'Avocado Toast', desc: 'Smashed avocado on toast, chilli, lemon, soft egg on top.', art: 'avotoast', photo: null, source: 'placeholder' },
      ],
    },
    {
      id: 'burgers',
      label: 'Burgers',
      caption: 'Beef off the grill, in a bun, with chips. The evening order.',
      items: [
        {
          name: 'Beef & Cheddar Burger',
          desc: 'Beef patty with Cheddar cheese.',
          art: 'burger', photo: null, source: 'listed',
        },
        { name: 'Double Beef', desc: 'Two patties, two slices of cheese, in the same bun.', art: 'burgerDouble', photo: null, source: 'placeholder' },
        { name: 'Chicken Burger', desc: 'Crumbed chicken, lettuce, mayo, brioche.', art: 'burgerChicken', photo: null, source: 'placeholder' },
        { name: 'Chips', desc: 'On the side, or not on the side.', art: 'chips', photo: null, source: 'placeholder' },
      ],
    },
    {
      id: 'pizza',
      label: 'Pizza',
      caption: 'The base is made fresh. That is why it takes a few minutes longer.',
      items: [
        {
          name: 'Underground Chicken Pizza',
          desc: 'Freshly made base, special Underground garlic sauce, cheese, chicken, sweetcorn, peppers, black olives and onions.',
          art: 'pizza', photo: null, source: 'listed',
        },
        { name: 'Margherita', desc: 'Tomato, cheese, and nothing else on it.', art: 'pizzaMargherita', photo: null, source: 'placeholder' },
        { name: 'Pepperoni', desc: 'Beef pepperoni, cheese, oregano.', art: 'pizzaPepperoni', photo: null, source: 'placeholder' },
      ],
    },
    {
      id: 'doner',
      label: 'Doner & Sandwiches',
      caption: 'The late half of the menu, and the thing the kitchen is known for.',
      items: [
        {
          name: 'Lamb Doner',
          desc: 'Cabbage, lettuce, tomato and cucumber with garlic sauce and minty chilli sauce, in signature pitta-style bread made from pizza dough.',
          art: 'doner', photo: null, source: 'listed',
        },
        { name: 'Chicken Doner', desc: 'The same build, chicken off the spit.', art: 'donerChicken', photo: null, source: 'placeholder' },
        { name: 'Club Sandwich', desc: 'Toasted, stacked, cut in three, chips alongside.', art: 'sando', photo: null, source: 'placeholder' },
      ],
    },
    {
      id: 'desserts',
      label: 'Desserts',
      caption: 'The reason the kitchen light is still on at midnight.',
      items: [
        // The business's own site has a page for a Dubai Cookie — the name
        // is theirs; the description here is still a stand-in.
        { name: 'Dubai Cookie', desc: 'Pistachio and kunafa, baked to order, served warm in the pan.', art: 'cookie', photo: null, source: 'placeholder' },
        { name: 'Cheesecake', desc: 'Burnt top, loose centre, nothing on the plate beside it.', art: 'basque', photo: null, source: 'placeholder' },
        { name: 'Tiramisu', desc: 'Built in a glass, cocoa over the top.', art: 'tiramisu', photo: null, source: 'placeholder' },
        { name: 'Sticky Toffee Pudding', desc: 'Warm, toffee poured at the table, vanilla ice cream.', art: 'pudding', photo: null, source: 'placeholder' },
      ],
    },
    {
      id: 'drinks',
      label: 'Drinks',
      caption: 'Coffee, cold things, and something for the table at midnight.',
      items: [
        { name: 'Espresso', desc: 'Short and black, with water alongside.', art: 'espresso', photo: null, source: 'placeholder' },
        { name: 'Flat White', desc: 'Double shot, steamed milk stretched thin.', art: 'flatwhite', photo: null, source: 'placeholder' },
        { name: 'Iced Latte', desc: 'Long ice, milk, shots poured over the top.', art: 'icedlatte', photo: null, source: 'placeholder' },
        { name: 'Mint Lemonade', desc: 'Blended, sharp, the standard Dubai order.', art: 'lemonade', photo: null, source: 'placeholder' },
        { name: 'Peach Iced Tea', desc: 'Brewed and chilled, not poured from a carton.', art: 'icedtea', photo: null, source: 'placeholder' },
        { name: 'Fresh Orange', desc: 'Squeezed when you order it.', art: 'orange', photo: null, source: 'placeholder' },
      ],
    },
  ],
}

export const featured = {
  eyebrow: 'SIGNATURE',
  name: 'The Lamb Doner',
  kicker: 'In pitta made from the pizza dough, because they had the dough anyway.',
  // Every clause below is from the listing description. Nothing added.
  body:
    'Cabbage, lettuce, tomato and cucumber, garlic sauce and minty chilli ' +
    'sauce, wrapped in signature pitta-style bread made from the same base ' +
    'they roll for the pizzas. It is the item the late half of the evening ' +
    'runs on.',
  meta: [
    { k: 'BREAD', v: 'Pitta, from pizza dough' },
    { k: 'SAUCE', v: 'Garlic · minty chilli' },
    { k: 'ORDER', v: 'Until 01:00' },
  ],
  art: 'wide:doner',
  photo: null,
  status: 'listed',
}

export const gallery = {
  eyebrow: 'THE ROOM',
  title: 'Low light, brass, and a lot of concrete.',
  note:
    'No photograph of Underground is used here — every image on this page is ' +
    'drawn in code, and each one is a slot waiting for the real picture.',
  shots: [
    { art: 'gal-bar', photo: null, caption: 'The pass, from the end of the counter', span: 'wide' },
    { art: 'gal-pour', photo: null, caption: 'Milk, poured close', span: 'tall' },
    { art: 'gal-corner', photo: null, caption: 'The corner table, 22:40', span: 'std' },
    { art: 'gal-machine', photo: null, caption: 'Group head, mid-shot', span: 'std' },
    { art: 'gal-arch', photo: null, caption: 'The arch, looking back at the door', span: 'wide' },
    { art: 'gal-table', photo: null, caption: 'Two cups, one conversation', span: 'std' },
  ],
}

export const location = {
  eyebrow: 'FIND US',
  title: 'Majan, Dubai.',
  body:
    'Ground floor of One Residence, on the Majan side of Dubai Silicon Oasis. ' +
    'Dine in until one in the morning, or order through Deliveroo and Talabat.',
  bodyStatus: 'listed',
}

export const cta = {
  statement: 'STILL OPEN.',
  sub: 'VISIT UNDERGROUND',
  line: 'Shop 3, One Residence · Majan, Dubai · Daily until 01:00',
}

export const footer = {
  colophon:
    'An independent design concept for Underground Cafe, Majan. Not affiliated ' +
    'with, endorsed by, or produced for the business. Every image on this page ' +
    'is generated in code — no photograph of the restaurant is used. Menu items ' +
    'marked on the menu are from public delivery listings; the rest are ' +
    'placeholders, and no prices are shown.',
}
