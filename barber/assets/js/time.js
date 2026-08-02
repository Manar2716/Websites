/* ==========================================================================
   Time

   Every appointment is an absolute instant (a timestamptz on the server, a
   Date here) and every human-facing time is rendered in the shop's timezone,
   which is a setting. That split is the only way "Thursday 09:00" means the
   same thing to a customer in another country as it does to the barber.

   Intl does the conversion; there is no date library.
   ========================================================================== */

const DAY_MS = 86400000;

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const partsCache = new Map();

function partsIn(date, tz) {
  let fmt = partsCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    partsCache.set(tz, fmt);
  }
  const out = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out;
}

/** Milliseconds the zone is ahead of UTC at `date`. */
function zoneOffset(date, tz) {
  const p = partsIn(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * "2026-08-14" + "09:30" in the shop's zone -> the matching absolute instant.
 * Two passes so the offset used is the one in effect at the resulting instant,
 * which is what makes the hour after a DST change land correctly.
 */
export function zonedToInstant(ymd, hm, tz) {
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm] = String(hm).split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0);
  let guess = new Date(naive - zoneOffset(new Date(naive), tz));
  guess = new Date(naive - zoneOffset(guess, tz));
  return guess;
}

/** The calendar date in the shop's zone, as "YYYY-MM-DD". */
export function ymdIn(date, tz) {
  const p = partsIn(date, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Minutes past midnight in the shop's zone. */
export function minutesIn(date, tz) {
  const p = partsIn(date, tz);
  return p.hour * 60 + p.minute;
}

/** 0 = Sunday, for a plain "YYYY-MM-DD" — zone-independent by construction. */
export function weekdayOf(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function todayIn(tz) {
  return ymdIn(new Date(), tz);
}

export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY_MS);
  return t.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

export function startOfWeek(ymd, weekStartsOn = 1) {
  const shift = (weekdayOf(ymd) - weekStartsOn + 7) % 7;
  return addDays(ymd, -shift);
}

export function startOfMonth(ymd) {
  return `${ymd.slice(0, 7)}-01`;
}

export function endOfMonth(ymd) {
  const [y, m] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Instant at the start of a shop-local day; the exclusive end is `+1 day`. */
export function dayBounds(ymd, tz) {
  return [zonedToInstant(ymd, '00:00', tz), zonedToInstant(addDays(ymd, 1), '00:00', tz)];
}

export function minutesToHm(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function hmToMinutes(hm) {
  const [h, m] = String(hm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/* ------------------------------------------------------------ formatting -- */

const fmtCache = new Map();
function formatter(tz, opts) {
  const key = tz + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(undefined, { timeZone: tz, ...opts });
    fmtCache.set(key, f);
  }
  return f;
}

export function fmtTime(date, tz) {
  return formatter(tz, { hour: 'numeric', minute: '2-digit' }).format(toDate(date));
}

export function fmtDate(date, tz, style = 'medium') {
  const opts = style === 'full'
    ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    : style === 'long'
      ? { weekday: 'short', day: 'numeric', month: 'long' }
      : style === 'short'
        ? { day: 'numeric', month: 'short' }
        : { day: 'numeric', month: 'short', year: 'numeric' };
  return formatter(tz, opts).format(toDate(date));
}

export function fmtDateTime(date, tz) {
  return `${fmtDate(date, tz, 'long')} · ${fmtTime(date, tz)}`;
}

/** "Today", "Tomorrow", "Yesterday", else a short date. */
export function fmtDayLabel(ymd, tz) {
  const diff = daysBetween(todayIn(tz), ymd);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const [y, m, d] = ymd.split('-').map(Number);
  return formatter('UTC', {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(Math.abs(diff) > 300 ? { year: 'numeric' } : {}),
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function fmtRelative(date) {
  const d = toDate(date);
  const secs = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(secs);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < 60) return rtf.format(secs, 'second');
  if (abs < 3600) return rtf.format(Math.round(secs / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(secs / 3600), 'hour');
  if (abs < 2592000) return rtf.format(Math.round(secs / 86400), 'day');
  return rtf.format(Math.round(secs / 2592000), 'month');
}

export function fmtDuration(mins) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

export function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

export function isSameDay(a, b, tz) {
  return ymdIn(toDate(a), tz) === ymdIn(toDate(b), tz);
}
