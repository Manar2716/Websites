/* ==========================================================================
   Icons — a single stroked 24px set, inline so there is no icon-font
   download and no flash of missing glyphs. Every icon inherits currentColor.
   ========================================================================== */

const P = {
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  scissors: 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12',
  razor: 'M4 4h10a3 3 0 0 1 3 3v3H7a3 3 0 0 1-3-3V4ZM10 10v10M7 20h6',
  beard: 'M5 4v6a7 7 0 0 0 14 0V4M8 4v3M16 4v3M9 14c1 1.2 4 1.2 5 0',
  fade: 'M4 18h16M4 14h16M4 10h10M4 6h6',
  child: 'M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 8v7M8 11h8M9 21l3-6 3 6',
  star: 'm12 3 2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.4l6-.8L12 3Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21a8 8 0 0 1 16 0',
  users: 'M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21a8 8 0 0 1 16 0M17 4.2a4 4 0 0 1 0 7.6M22 21a6.5 6.5 0 0 0-3-5.5',
  pin: 'M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11ZM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  phone: 'M6.6 3h3l1.5 4-2 1.4a12 12 0 0 0 5.5 5.5l1.4-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.2 2 2 0 0 1 6.6 3Z',
  mail: 'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM3.5 6.5 12 13l8.5-6.5',
  instagram: 'M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17.5 6.6h.01',
  facebook: 'M14.5 8.5V6.8c0-.8.5-1.3 1.3-1.3H17V3h-2.2A3.6 3.6 0 0 0 11.2 7v1.5H9V11h2.2v10h3.3V11H17l.5-2.5h-3Z',
  tiktok: 'M15 3v10.5a3.5 3.5 0 1 1-3.5-3.5M15 3c.4 2.4 2 4 4.5 4.2',
  whatsapp: 'M3.5 20.5 5 16.6A8 8 0 1 1 8 19.4l-4.5 1.1ZM9 9.2c.4 2.5 3 4.9 5.6 5.3l1-1.4 1.8.8v1.4c-.1.6-.7 1-1.4.9a9.4 9.4 0 0 1-8.3-8.3c0-.7.4-1.3 1-1.3h1.4l.8 1.8-1 1',
  check: 'm5 13 4.5 4.5L19 7',
  checkCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM8.5 12.2l2.4 2.4 4.6-4.8',
  x: 'M6 6l12 12M18 6 6 18',
  xCircle: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9.5l5 5M14.5 9.5l-5 5',
  alert: 'M12 3.5 22 20H2L12 3.5ZM12 10v4M12 17.2h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 7.8h.01',
  chevronLeft: 'm14.5 6-6 6 6 6',
  chevronRight: 'm9.5 6 6 6-6 6',
  chevronDown: 'm6 9.5 6 6 6-6',
  chevronUp: 'm6 14.5 6-6 6 6',
  arrowRight: 'M4 12h15M13 6l6 6-6 6',
  arrowLeft: 'M20 12H5M11 18l-6-6 6-6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  pencil: 'M4 20h4L20 8a2.8 2.8 0 0 0-4-4L4 16v4ZM14.5 5.5l4 4',
  trash: 'M4 7h16M10 4h4M6 7l1 13h10l1-13M10 11v6M14 11v6',
  image: 'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1ZM3.5 16.5 8 12l4 4 3-2.5 5.5 5M8.5 9.2h.01',
  upload: 'M12 16V4M8 8l4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  dashboard: 'M4 4h7v9H4zM13 4h7v5h-7zM13 13h7v7h-7zM4 17h7v3H4z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V20a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.4 18l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4 12.6H4a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 5.6 6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V2a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3Z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1.8v2.4M12 19.8v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M1.8 12h2.4M19.8 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM16.2 16.2 21 21',
  filter: 'M3 5h18l-7 8v6l-4 2v-8L3 5Z',
  grip: 'M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01',
  logout: 'M15 17l5-5-5-5M20 12H9M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6',
  lock: 'M6 10h12a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM8 10V7a4 4 0 0 1 8 0v3M12 15v2',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  euro: 'M17 5.5A6.5 6.5 0 0 0 7.5 12 6.5 6.5 0 0 0 17 18.5M4 10.5h8M4 14h8',
  trending: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  wallet: 'M4 6h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM3 9h17M16.5 13.5h.01',
  quote: 'M9 6C6.5 7.2 5 9.6 5 13v5h6v-6H8c0-2 .4-3.4 2-4.4L9 6ZM19 6c-2.5 1.2-4 3.6-4 7v5h6v-6h-3c0-2 .4-3.4 2-4.4L19 6Z',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.6M12 17.2h.01',
  ban: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8',
  refresh: 'M20 11a8 8 0 0 0-14-4.5L3.5 9M4 13a8 8 0 0 0 14 4.5L20.5 15M3.5 4.5V9H8M20.5 19.5V15H16',
  sparkle: 'm12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3ZM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z',
  external: 'M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  palm: 'M12 21v-9M12 12c-1-3.5-4-5-7-4 1.5-2.7 5-3.2 7 0 .8-3.3 4.5-4.2 7-1.6-3-1-6 .4-7 5.6Z',
  layers: 'm12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5M3 17l9 5 9-5',
  bell: 'M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6ZM10.5 20a1.8 1.8 0 0 0 3 0',
  note: 'M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM14 3v5h5M8.5 13h7M8.5 17h4',
};

const FILLED = new Set(['star']);

/**
 * Returns an <svg> string for the named icon.
 * Unknown names render nothing rather than throwing, so a bad content value
 * from the database can never blank a page.
 */
export function icon(name, { size = 24, className = '', label = '' } = {}) {
  const d = P[name];
  if (!d) return '';
  const a11y = label
    ? `role="img" aria-label="${label.replace(/"/g, '&quot;')}"`
    : 'aria-hidden="true"';
  const fill = FILLED.has(name) ? 'currentColor' : 'none';
  return `<svg ${a11y} class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24"
    fill="${fill}" stroke="currentColor" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
}

export function hasIcon(name) {
  return Object.prototype.hasOwnProperty.call(P, name);
}

export const iconNames = Object.keys(P);
