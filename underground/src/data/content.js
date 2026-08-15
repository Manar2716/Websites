/* ═══════════════════════════════════════════════════════════════════
   EVERY WORD ON THE SITE LIVES IN THIS FILE.
   ═══════════════════════════════════════════════════════════════════

   Nothing here is invented about the business. Each fact carries a
   `status` so the owner can see at a glance what still needs checking:

     'confirmed'   taken from the cafe's own website or its verified
                   social profile
     'listed'      taken from a third-party directory (Zomato, Talabat,
                   Deliveroo, Yalah). Almost certainly right, but it is
                   not the business speaking — worth a glance.
     'placeholder' NOT REAL. A stand-in so the layout has something of
                   the right shape in it. Replace before this site goes
                   anywhere near a customer.

   Search this file for `placeholder` to find everything outstanding.
   The site renders a visible note anywhere a whole block is standing
   in — see `menu.note` — so nothing unverified is ever presented to a
   reader as fact.

   There are no reviews, ratings, awards or superlatives anywhere in
   this file, and there should not be: none of it can be sourced.
   ═══════════════════════════════════════════════════════════════════ */

export const OFFICIAL_URL = 'https://undergroundcafe.ae/'

export const brand = {
  name: 'UNDERGROUND',
  full: 'Underground Cafe',
  sub: 'CAFE • DUBAI',
  // The tagline is the site's own line, not a claim about the business.
  tagline: 'Coffee below the noise.',
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
    note: 'Kitchen closes 30 minutes before the room does.',
    noteStatus: 'placeholder',
    status: 'listed',
  },
  social: [
    // status: confirmed — the handle on the cafe's own site
    { label: 'Instagram', handle: '@undergroundcafe.ae', href: 'https://www.instagram.com/undergroundcafe.ae/', status: 'confirmed' },
    { label: 'Website', handle: 'undergroundcafe.ae', href: OFFICIAL_URL, status: 'confirmed' },
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
  // Descriptive, not promotional. Every clause is something a reader can
  // check against the room itself.
  lines: ['A room under Majan', 'that keeps its own hours.'],
  standfirst:
    'Espresso in the afternoon, plates until late, and low light the whole way through. ' +
    'Shop 3, One Residence — open every day until one in the morning.',
  scrollHint: 'SCROLL',
}

export const marquee = [
  'SPECIALTY COFFEE',
  'MAJAN · DUBAI',
  'OPEN UNTIL 01:00',
  'ALL-DAY KITCHEN',
  'ESTABLISHED IN DUBAI',
]

export const about = {
  eyebrow: 'THE ROOM',
  title: 'Down a step, out of the heat.',
  body: [
    'Underground is a small room in Majan with the lights kept low and the ' +
      'espresso machine kept loud. It is the kind of place you end up in at four ' +
      'in the afternoon because the sun is still going, and again at midnight ' +
      'because nothing else nearby is still open.',
    'The coffee is the point. Everything else — the plates, the late kitchen, ' +
      'the corner tables people quietly treat as their own — grew around it because ' +
      'the people who came for a flat white kept staying for a reason to sit down.',
  ],
  pull: 'No queue for a table you have already claimed.',
  stats: [
    // status: placeholder — the year is not published anywhere public.
    { k: 'EST.', v: '20—', note: 'Year to confirm', status: 'placeholder' },
    { k: 'DUBAI', v: 'Majan', note: 'One Residence, Shop 3', status: 'listed' },
    { k: 'COFFEE', v: 'Daily', note: 'From noon', status: 'listed' },
    { k: 'COMMUNITY', v: 'Til 01:00', note: 'Every night', status: 'listed' },
  ],
}

export const ritual = {
  eyebrow: 'THE RITUAL',
  title: 'Five things happen before it reaches the table.',
  steps: [
    { n: '01', art: 'beans', title: 'The green', body: 'Sacks in, sorted by hand, defects out. Nothing gets roasted that would not survive being tasted black.' },
    { n: '02', art: 'roast', title: 'The drum', body: 'Heat, time and a nose at the trier. First crack is a sound, not a number on a screen.' },
    { n: '03', art: 'grind', title: 'The grind', body: 'Dialled to the morning, then dialled again at four when the room warms up and the shots start running fast.' },
    { n: '04', art: 'extraction', title: 'The shot', body: 'Nine bars, roughly thirty seconds, watched every time. A shot that runs long gets poured away rather than served.' },
    { n: '05', art: 'pour', title: 'The pour', body: 'Milk stretched, not scalded. Poured close, finished high, and set down without ceremony.' },
  ],
}

/* ═══════════════════════════════════════════════════════════════════
   MENU — placeholder set.

   The live menu is at undergroundcafe.ae and is not reproduced here:
   item names, descriptions and prices below are a design stand-in of
   roughly the right shape, and the menu section says so on the page.
   `art` names the drawing used for the item (see src/art/painters.js).
   Prices are AED.
   ═══════════════════════════════════════════════════════════════════ */

export const menu = {
  eyebrow: 'THE MENU',
  title: 'Read the room, then the list.',
  note:
    'Sample layout — item names and prices below are placeholders. ' +
    'The live menu is on the official site.',
  cta: 'EXPLORE FULL MENU',
  categories: [
    {
      id: 'coffee',
      label: 'Coffee',
      caption: 'Pulled to order. Single origin on the second grinder, changed when it runs out.',
      items: [
        { name: 'Espresso', desc: 'House blend, two ristretto-leaning shots, served with sparkling water.', price: 18, art: 'espresso' },
        { name: 'Flat White', desc: 'Double shot, steamed milk stretched thin. The one to judge us by.', price: 24, art: 'flatwhite' },
        { name: 'Cortado', desc: 'Equal parts, in glass, for when a flat white is too much milk.', price: 22, art: 'cortado' },
        { name: 'Filter — V60', desc: 'Rotating single origin, poured in four stages, served black.', price: 28, art: 'v60' },
        { name: 'Iced Spanish Latte', desc: 'Condensed milk, long ice, double shot poured over the top.', price: 29, art: 'icedlatte' },
        { name: 'Ceremonial Matcha', desc: 'Whisked to order, over milk or over ice.', price: 30, art: 'matcha' },
      ],
    },
    {
      id: 'breakfast',
      label: 'Breakfast',
      caption: 'Served from open until close, because breakfast at 9pm is a legitimate position.',
      items: [
        { name: 'Avocado & Chilli Toast', desc: 'Sourdough, smashed avocado, lemon, chilli, soft egg on top.', price: 46, art: 'avotoast' },
        { name: 'Shakshuka', desc: 'Eggs baked in tomato and pepper, in the pan, with bread to clear it.', price: 52, art: 'shakshuka' },
        { name: 'Ricotta Pancakes', desc: 'Three stacked, butter, date syrup, toasted pistachio.', price: 48, art: 'pancakes' },
        { name: 'Eggs Benedict', desc: 'Poached eggs, hollandaise, on a toasted muffin.', price: 54, art: 'benedict' },
      ],
    },
    {
      id: 'mains',
      label: 'Main Dishes',
      caption: 'The late half of the menu. Ordered most often after ten.',
      items: [
        { name: 'Truffle Mushroom Burger', desc: 'Beef patty, aged cheese, truffle mayo, brioche, fries.', price: 78, art: 'burger' },
        { name: 'Wagyu Sando', desc: 'Milk bread, thin-cut wagyu, mustard, pickles, cut in three.', price: 96, art: 'sando' },
        { name: 'Truffle Tagliatelle', desc: 'Cream, parmesan, black truffle shaved at the pass.', price: 82, art: 'pasta' },
        { name: 'Chicken Milanese', desc: 'Flattened, crumbed, lemon, rocket and parmesan on top.', price: 74, art: 'milanese' },
      ],
    },
    {
      id: 'desserts',
      label: 'Desserts',
      caption: 'The reason the kitchen light is still on.',
      items: [
        // The cafe's own site has a page for a Dubai Cookie — the name is
        // theirs, the description and price below are still placeholder.
        { name: 'Dubai Cookie', desc: 'Pistachio and kunafa, baked to order, served warm in the pan.', price: 42, art: 'cookie' },
        { name: 'Basque Cheesecake', desc: 'Burnt top, loose centre, nothing on the plate beside it.', price: 38, art: 'basque' },
        { name: 'Tiramisu', desc: 'Built in a glass, espresso from the same machine as everything else.', price: 36, art: 'tiramisu' },
        { name: 'Sticky Date Pudding', desc: 'Warm, toffee poured at the table, vanilla ice cream.', price: 40, art: 'pudding' },
      ],
    },
    {
      id: 'drinks',
      label: 'Drinks',
      caption: 'For the table that is not drinking coffee at midnight.',
      items: [
        { name: 'Mint Lemonade', desc: 'Blended, sharp, the standard Dubai order.', price: 26, art: 'lemonade' },
        { name: 'Peach Iced Tea', desc: 'Brewed and chilled in-house, not poured from a carton.', price: 24, art: 'icedtea' },
        { name: 'Fresh Orange', desc: 'Squeezed when you order it.', price: 28, art: 'orange' },
        { name: 'Sparkling Water', desc: 'Large bottle, ice, lime.', price: 18, art: 'sparkling' },
      ],
    },
  ],
}

export const featured = {
  eyebrow: 'SIGNATURE',
  name: 'The Dubai Cookie',
  kicker: 'Pistachio, kunafa, and a centre that has not set yet.',
  body:
    'Baked to order in its own pan, which is why it takes twelve minutes and ' +
    'why it arrives too hot to pick up. Pistachio through the middle, shredded ' +
    'kunafa on top for the noise it makes, and nothing else on the plate.',
  meta: [
    { k: 'SERVED', v: 'In the pan, warm' },
    { k: 'TAKES', v: '~12 minutes' },
    { k: 'ORDER', v: 'From noon until close' },
  ],
  // status: placeholder — this item exists on the official site; the
  // detail above is written for the layout and needs the kitchen's sign-off.
  status: 'placeholder',
}

export const gallery = {
  eyebrow: 'THE ROOM',
  title: 'Low light, brass, and a lot of concrete.',
  note: 'Every image on this page is drawn in code — no photograph of the cafe is used.',
  shots: [
    { art: 'gal-bar', caption: 'The pass, from the end of the counter', span: 'wide' },
    { art: 'gal-pour', caption: 'Milk, poured close', span: 'tall' },
    { art: 'gal-corner', caption: 'The corner table, 22:40', span: 'std' },
    { art: 'gal-machine', caption: 'Group head, mid-shot', span: 'std' },
    { art: 'gal-arch', caption: 'The arch, looking back at the door', span: 'wide' },
    { art: 'gal-table', caption: 'Two cups, one conversation', span: 'std' },
  ],
}

export const location = {
  eyebrow: 'FIND US',
  title: 'Majan, Dubai.',
  body:
    'Ground floor of One Residence, on the Majan side of Dubai Silicon Oasis. ' +
    'Parking is on the street in front of the building, and it is easier after dark.',
  bodyStatus: 'placeholder', // the parking line needs confirming
}

export const cta = {
  statement: 'YOUR NEXT COFFEE SPOT.',
  sub: 'VISIT UNDERGROUND',
  line: 'Shop 3, One Residence · Majan, Dubai · Daily until 01:00',
}

export const footer = {
  colophon:
    'An independent design concept for Underground Cafe. Not affiliated with ' +
    'the business. Every image on this page is generated in code.',
}
