/* ═══════════════════════════════════════════════════════════
   mcdu.js — a working multipurpose control and display unit.

   Not a picture of one. The keypad types into a scratchpad, the
   line-select keys move the scratchpad into a field, the field
   validates what it was given, and the flight plan that comes
   out is drawn on the navigation display and flown by the
   autopilot. Enter LFBO/OMDB and the magenta line on the ND is
   the great circle between Toulouse and Dubai.

   The airport list is real: fifty-odd ICAO identifiers with
   their published coordinates. Waypoints between them are
   generated on the great circle and named the way oceanic
   waypoints are named, from the latitude and longitude they sit
   at.
   ═══════════════════════════════════════════════════════════ */

import { clamp, pad, deg, rad2deg } from './core.js';
import { screen, mono, GREEN, MAGENTA, CYAN, AMBER, WHITE, GREY } from './displays.js';

/* ── navigation database ─────────────────────────────────── */

/* [ICAO, city, lat, lon] — published airport reference points. */
export const AIRPORTS = [
  ['LFBO', 'TOULOUSE', 43.6291, 1.3638], ['LFPG', 'PARIS', 49.0097, 2.5479],
  ['LFMN', 'NICE', 43.6584, 7.2159], ['EGLL', 'LONDON', 51.4700, -0.4543],
  ['EGKK', 'GATWICK', 51.1537, -0.1821], ['EIDW', 'DUBLIN', 53.4213, -6.2701],
  ['EHAM', 'AMSTERDAM', 52.3105, 4.7683], ['EDDF', 'FRANKFURT', 50.0379, 8.5622],
  ['EDDM', 'MUNICH', 48.3538, 11.7861], ['LSZH', 'ZURICH', 47.4647, 8.5492],
  ['LOWW', 'VIENNA', 48.1103, 16.5697], ['LEMD', 'MADRID', 40.4719, -3.5626],
  ['LEBL', 'BARCELONA', 41.2971, 2.0785], ['LPPT', 'LISBON', 38.7742, -9.1342],
  ['LIRF', 'ROME', 41.8003, 12.2389], ['LIMC', 'MILAN', 45.6306, 8.7281],
  ['EKCH', 'COPENHAGEN', 55.6180, 12.6560], ['ESSA', 'STOCKHOLM', 59.6519, 17.9186],
  ['BIKF', 'KEFLAVIK', 63.9850, -22.6056], ['LTFM', 'ISTANBUL', 41.2753, 28.7519],
  ['UUEE', 'MOSCOW', 55.9726, 37.4146], ['OMDB', 'DUBAI', 25.2532, 55.3657],
  ['OTHH', 'DOHA', 25.2731, 51.6081], ['OERK', 'RIYADH', 24.9576, 46.6988],
  ['VIDP', 'DELHI', 28.5562, 77.1000], ['VABB', 'MUMBAI', 19.0896, 72.8656],
  ['VTBS', 'BANGKOK', 13.6900, 100.7501], ['WSSS', 'SINGAPORE', 1.3644, 103.9915],
  ['WMKK', 'KUALA LUMPUR', 2.7456, 101.7099], ['VHHH', 'HONG KONG', 22.3080, 113.9185],
  ['ZBAA', 'BEIJING', 40.0799, 116.6031], ['ZSPD', 'SHANGHAI', 31.1443, 121.8083],
  ['RKSI', 'SEOUL', 37.4602, 126.4407], ['RJTT', 'TOKYO HND', 35.5494, 139.7798],
  ['RJAA', 'TOKYO NRT', 35.7647, 140.3864], ['YSSY', 'SYDNEY', -33.9399, 151.1753],
  ['YMML', 'MELBOURNE', -37.6690, 144.8410], ['NZAA', 'AUCKLAND', -37.0082, 174.7850],
  ['KJFK', 'NEW YORK', 40.6413, -73.7781], ['KBOS', 'BOSTON', 42.3656, -71.0096],
  ['KIAD', 'WASHINGTON', 38.9531, -77.4565], ['KATL', 'ATLANTA', 33.6407, -84.4277],
  ['KORD', 'CHICAGO', 41.9742, -87.9073], ['KDFW', 'DALLAS', 32.8998, -97.0403],
  ['KLAX', 'LOS ANGELES', 33.9416, -118.4085], ['KSFO', 'SAN FRANCISCO', 37.6213, -122.3790],
  ['KSEA', 'SEATTLE', 47.4502, -122.3088], ['KMIA', 'MIAMI', 25.7959, -80.2870],
  ['PANC', 'ANCHORAGE', 61.1743, -149.9962], ['CYYZ', 'TORONTO', 43.6777, -79.6248],
  ['MMMX', 'MEXICO CITY', 19.4363, -99.0721], ['SBGR', 'SAO PAULO', -23.4356, -46.4731],
  ['SAEZ', 'BUENOS AIRES', -34.8222, -58.5358], ['SCEL', 'SANTIAGO', -33.3930, -70.7858],
  ['GMMN', 'CASABLANCA', 33.3675, -7.5900], ['HECA', 'CAIRO', 30.1219, 31.4056],
  ['DNMM', 'LAGOS', 6.5774, 3.3212], ['HKJK', 'NAIROBI', -1.3192, 36.9278],
  ['FAOR', 'JOHANNESBURG', -26.1392, 28.2460], ['FACT', 'CAPE TOWN', -33.9715, 18.6021]
];

export const findAirport = (icao) =>
  AIRPORTS.find((a) => a[0] === String(icao || '').toUpperCase());

/* Great-circle distance in nautical miles. */
export function gcDistance(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * deg, φ2 = lat2 * deg;
  const dφ = (lat2 - lat1) * deg, dλ = (lon2 - lon1) * deg;
  const a = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 6371 / 1.852;
}

export function gcBearing(lat1, lon1, lat2, lon2) {
  const φ1 = lat1 * deg, φ2 = lat2 * deg, dλ = (lon2 - lon1) * deg;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (Math.atan2(y, x) * rad2deg + 360) % 360;
}

/* Intermediate point at fraction f along the great circle. */
function gcPoint(lat1, lon1, lat2, lon2, f) {
  const φ1 = lat1 * deg, λ1 = lon1 * deg, φ2 = lat2 * deg, λ2 = lon2 * deg;
  const d = gcDistance(lat1, lon1, lat2, lon2) * 1.852 / 6371;
  if (d < 1e-6) return [lat1, lon1];
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return [Math.atan2(z, Math.hypot(x, y)) * rad2deg, Math.atan2(y, x) * rad2deg];
}

/* The way an oceanic waypoint is actually named. */
function coordName(lat, lon) {
  return `${pad(Math.abs(lat), 2)}${lat >= 0 ? 'N' : 'S'}${pad(Math.abs(lon), 3)}${lon >= 0 ? 'E' : 'W'}`;
}

/* ── flight plan ─────────────────────────────────────────── */

export class FlightPlan {
  constructor() {
    this.from = null;
    this.to = null;
    this.altn = null;
    this.flightNo = '';
    this.crzFl = 350;
    this.costIndex = 30;
    this.legs = [];
    this.originLat = 43.6291;
    this.originLon = 1.3638;
  }

  /* Local scene metres, relative to the departure field. +X is
     east, −Z is north, which is the convention the flight model
     integrates in. */
  toLocal(lat, lon) {
    const x = (lon - this.originLon) * 111320 * Math.cos(this.originLat * deg);
    const z = -(lat - this.originLat) * 110540;
    return { x, z };
  }

  setFrom(icao) {
    const a = findAirport(icao);
    if (!a) return 'NOT IN DATABASE';
    this.from = a;
    this.originLat = a[2]; this.originLon = a[3];
    this.rebuild();
    return null;
  }

  setTo(icao) {
    const a = findAirport(icao);
    if (!a) return 'NOT IN DATABASE';
    this.to = a;
    this.rebuild();
    return null;
  }

  get distance() {
    return this.from && this.to ? gcDistance(this.from[2], this.from[3], this.to[2], this.to[3]) : 0;
  }

  /* One waypoint every ~250 nm, which is roughly how a real
     oceanic track is broken up, capped so a short hop still gets
     a couple and a long one does not get forty. */
  rebuild() {
    this.legs = [];
    if (!this.from) return;
    const push = (name, lat, lon) => {
      const p = this.toLocal(lat, lon);
      this.legs.push({ name, lat, lon, x: p.x, z: p.z });
    };
    push(this.from[0], this.from[2], this.from[3]);
    if (!this.to) return;
    const d = this.distance;
    const n = clamp(Math.round(d / 250), 1, 14);
    for (let i = 1; i < n; i++) {
      const [lat, lon] = gcPoint(this.from[2], this.from[3], this.to[2], this.to[3], i / n);
      push(coordName(lat, lon), lat, lon);
    }
    push(this.to[0], this.to[2], this.to[3]);
  }
}

/* ── the unit ────────────────────────────────────────────── */

const COLS = 24;
const ROWS = 14;

export class MCDU {
  constructor(fm, size = 512) {
    Object.assign(this, screen(size, Math.round(size * 1.28)));
    this.S = size;
    this.fm = fm;
    this.plan = new FlightPlan();
    this.plan.setFrom('LFBO');
    this.page = 'MENU';
    this.scratch = '';
    this.message = '';
    this.fplnScroll = 0;
    this.dirty = true;
  }

  /* ── input ─────────────────────────────────────────────── */

  key(k) {
    this.dirty = true;
    this.message = '';
    if (k === 'CLR') {
      if (this.message) { this.message = ''; return; }
      if (this.scratch === '') { this.scratch = 'CLR'; return; }
      this.scratch = this.scratch === 'CLR' ? '' : this.scratch.slice(0, -1);
      return;
    }
    if (k === 'SP') { this.scratch += ' '; return; }
    if (k === 'OVFY') { this.scratch += '/'; return; }
    if (k.length === 1 || k === '+/-') {
      if (k === '+/-') {
        this.scratch = this.scratch.startsWith('-') ? this.scratch.slice(1) : '-' + this.scratch;
      } else if (this.scratch.length < COLS) {
        this.scratch += k;
      }
      return;
    }
    const PAGES = ['MENU', 'INIT', 'FPLN', 'PERF', 'RADNAV', 'DATA', 'PROG'];
    if (PAGES.includes(k)) { this.page = k; this.fplnScroll = 0; return; }
    if (k === 'UP') { this.fplnScroll = Math.max(0, this.fplnScroll - 1); return; }
    if (k === 'DOWN') { this.fplnScroll++; return; }
    if (/^[LR][1-6]$/.test(k)) this.lsk(k[0], +k[1]);
  }

  take() {
    const v = this.scratch;
    this.scratch = '';
    return v === 'CLR' ? '' : v;
  }

  lsk(side, n) {
    const p = this.page;
    const s = this.scratch;

    if (p === 'MENU') {
      const map = { 1: 'INIT', 2: 'FPLN', 3: 'PERF', 4: 'RADNAV', 5: 'DATA', 6: 'PROG' };
      if (side === 'L' && map[n]) this.page = map[n];
      return;
    }

    if (p === 'INIT') {
      if (side === 'L' && n === 2) {                 /* FROM/TO */
        const v = this.take();
        const m = v.match(/^([A-Za-z]{4})\/([A-Za-z]{4})$/);
        if (!m) { this.message = 'FORMAT ERROR'; return; }
        const e1 = this.plan.setFrom(m[1]);
        const e2 = this.plan.setTo(m[2]);
        if (e1 || e2) { this.message = e1 || e2; return; }
        this.fm.note(`ROUTE ${m[1].toUpperCase()} → ${m[2].toUpperCase()}`);
        this.onPlan?.(this.plan);
        return;
      }
      if (side === 'L' && n === 3) { this.plan.altn = this.take() || null; return; }
      if (side === 'L' && n === 4) { this.plan.flightNo = this.take(); return; }
      if (side === 'R' && n === 5) {
        const v = parseInt(this.take().replace(/\D/g, ''), 10);
        if (!Number.isNaN(v)) {
          this.plan.crzFl = clamp(v, 100, 430);
          this.fm.ap.alt = this.plan.crzFl * 100;
        } else this.message = 'ENTRY OUT OF RANGE';
        return;
      }
      if (side === 'R' && n === 6) {
        const v = parseInt(this.take(), 10);
        if (!Number.isNaN(v)) this.plan.costIndex = clamp(v, 0, 999);
        else this.message = 'ENTRY OUT OF RANGE';
        return;
      }
      return;
    }

    if (p === 'PERF') {
      if (side === 'R' && n === 1) {
        const v = parseInt(this.take(), 10);
        if (!Number.isNaN(v)) this.fm.ap.spd = clamp(v, 100, 350);
        else this.message = 'ENTRY OUT OF RANGE';
        return;
      }
      if (side === 'R' && n === 2) {
        const v = parseInt(this.take(), 10);
        if (!Number.isNaN(v)) this.fm.ap.alt = clamp(v, 0, 43000);
        else this.message = 'ENTRY OUT OF RANGE';
        return;
      }
      if (side === 'L' && n === 6) { this.fm.ap.athr = !this.fm.ap.athr; return; }
      return;
    }

    if (p === 'FPLN') {
      /* selecting a leg makes it the active one to fly toward */
      const i = this.fplnScroll + n - 1;
      const leg = this.plan.legs[i];
      if (leg && side === 'L') {
        this.activeLeg = i;
        const brg = gcBearing(this.plan.originLat, this.plan.originLon, leg.lat, leg.lon);
        this.fm.ap.hdg = Math.round(brg);
        this.fm.note(`DIRECT ${leg.name}`);
      }
      return;
    }

    if (p === 'RADNAV' && side === 'L' && n === 1) {
      this.take();
      this.message = 'NOT IMPLEMENTED';
      return;
    }
    void s;
  }

  /* ── rendering ─────────────────────────────────────────── */

  lines() {
    const fm = this.fm, plan = this.plan;
    const L = [];
    const row = (l = '', c = '', r = '', col = WHITE) => L.push({ l, c, r, col });
    const small = (l = '', c = '', r = '') => L.push({ l, c, r, col: WHITE, small: true });

    if (this.page === 'MENU') {
      row('', 'MCDU MENU', '', WHITE);
      small('', '', '');
      row('<INIT', '', '', CYAN);
      small('', '', '');
      row('<F-PLN', '', 'PERF>', CYAN);
      small('', '', '');
      row('<RAD NAV', '', 'DATA>', CYAN);
      small('', '', '');
      row('<PROG', '', '', CYAN);
      small('', '', '');
      row('', '', '');
      small('', 'SELECT WITH LINE KEYS', '');
      row('', '', '');
      small('', '', '');
    } else if (this.page === 'INIT') {
      row('', 'INIT', '', WHITE);
      small('CO RTE', '', 'FROM/TO');
      row(plan.from && plan.to ? `${plan.from[0]}${plan.to[0]}` : '----------', '',
        plan.from && plan.to ? `${plan.from[0]}/${plan.to[0]}` : '____/____', CYAN);
      small('ALTN/CO RTE', '', 'INIT');
      row(plan.altn || '----/----------', '', 'REQUEST*', AMBER);
      small('FLT NBR', '', '');
      row(plan.flightNo || '________', '', '', CYAN);
      small('', '', 'CRZ FL/TEMP');
      row('', '', `FL${plan.crzFl}/${Math.round(-56)}°`, CYAN);
      small('', '', 'COST INDEX');
      row('', '', String(plan.costIndex), CYAN);
      small('', '', 'TROPO');
      row('', plan.from && plan.to ? `${Math.round(plan.distance)} NM` : '', '36090', GREEN);
      small('', '', '');
    } else if (this.page === 'FPLN') {
      row('', `F-PLN  ${plan.from ? plan.from[0] : '----'}`, '', WHITE);
      const legs = plan.legs;
      const start = clamp(this.fplnScroll, 0, Math.max(0, legs.length - 5));
      this.fplnScroll = start;
      let cum = 0;
      for (let k = 0; k < 5; k++) {
        const i = start + k;
        const w = legs[i];
        if (!w) { small('', '', ''); row('', '', ''); continue; }
        if (i > 0) {
          const p = legs[i - 1];
          cum += gcDistance(p.lat, p.lon, w.lat, w.lon);
        }
        const brg = i > 0 ? gcBearing(legs[i - 1].lat, legs[i - 1].lon, w.lat, w.lon) : 0;
        small(i === 0 ? '' : `${pad(brg, 3)}°`, '', `${Math.round(cum)}NM`);
        row(w.name, '', `FL${plan.crzFl}`, i === this.activeLeg ? WHITE : GREEN);
      }
      small('', '', 'DEST  DIST  EFOB');
      row('', '', plan.to ? `${plan.to[0]} ${Math.round(plan.distance)}` : '----', WHITE);
    } else if (this.page === 'PERF') {
      row('', `PERF ${fm.phaseName}`, '', WHITE);
      small('', '', 'SEL SPD');
      row('V1  ' + Math.round(fm.v1Kt), '', String(Math.round(fm.ap.spd)), CYAN);
      small('', '', 'SEL ALT');
      row('VR  ' + Math.round(fm.vrKt), '', String(Math.round(fm.ap.alt)), CYAN);
      small('', '', '');
      row('V2  ' + Math.round(fm.v2Kt), '', '', GREEN);
      small('', '', '');
      row('VREF ' + Math.round(fm.vRefKt), '', '', GREEN);
      small('THR RED/ACC', '', '');
      row('1500/1500', '', '', CYAN);
      small('', '', '');
      row(fm.ap.athr ? '<A/THR ON' : '<A/THR OFF', '', '', fm.ap.athr ? GREEN : AMBER);
      small('', '', '');
    } else if (this.page === 'PROG') {
      const rw = fm.toRunway();
      row('', `PROG ${fm.type.name}`, '', WHITE);
      small('CRZ', '', 'OPT  REC MAX');
      row(`FL${plan.crzFl}`, '', `FL370 FL${Math.round(fm.type.spec.ceiling / 100)}`, GREEN);
      small('', 'DIST TO DEST', '');
      row('', plan.to ? `${Math.round(plan.distance)} NM` : '---', '', GREEN);
      small('', 'DIST TO RWY09', '');
      row('', `${rw.dist.toFixed(1)} NM`, `${pad(rw.brg, 3)}°`, GREEN);
      small('', 'GROUND SPEED', '');
      row('', `${Math.round(fm.tas)} KT`, `M${fm.mach.toFixed(3).slice(1)}`, GREEN);
      small('', 'GROSS WEIGHT', '');
      row('', `${Math.round(fm.mass / 1000)} T`, '', GREEN);
      small('', '', '');
    } else if (this.page === 'DATA') {
      const s = fm.type.spec;
      row('', 'A/C STATUS', '', WHITE);
      small('ENG', '', '');
      row(s.engines.slice(0, 22), '', '', GREEN);
      small('ACTIVE DATA BASE', '', '');
      row('AIRAC — PROCEDURAL', '', '', CYAN);
      small('MTOW', '', 'RANGE');
      row(`${Math.round(s.mtow / 1000)} T`, '', `${s.rangeNmi} NM`, GREEN);
      small('WINGSPAN', '', 'LENGTH');
      row(`${s.span.toFixed(2)} M`, '', `${s.length.toFixed(2)} M`, GREEN);
      small('SEATS', '', 'CEILING');
      row(`${s.seatsTypical}`, '', `FL${Math.round(s.ceiling / 100)}`, GREEN);
      small('', '', '');
    } else {
      row('', 'RAD NAV', '', WHITE);
      small('VOR1/FREQ', '', 'FREQ/VOR2');
      row('[  ]/---.--', '', '---.--/[  ]', CYAN);
      small('CRS', '', 'CRS');
      row('---', '', '---', CYAN);
      small('ILS/FREQ', '', '');
      row('RW09/110.30', '', '', CYAN);
      small('CRS', '', '');
      row('090', '', '', CYAN);
      small('ADF1/FREQ', '', 'FREQ/ADF2');
      row('[  ]/----', '', '----/[  ]', CYAN);
      small('', '', '');
      row('', '', '');
      small('', '', '');
    }
    while (L.length < ROWS) L.push({ l: '', c: '', r: '', col: WHITE });
    return L.slice(0, ROWS);
  }

  draw() {
    const { x, S } = this;
    const H = this.c.height;
    x.fillStyle = '#040a08';
    x.fillRect(0, 0, S, H);

    const rows = this.lines();
    const rowH = (H * 0.90) / (ROWS + 1);
    const padX = S * 0.045;
    const big = S * 0.052, sml = S * 0.036;

    rows.forEach((r, i) => {
      const y = rowH * (i + 0.9);
      const size = r.small ? sml : big;
      const col = r.small ? GREY : r.col;
      x.font = mono(size, r.small ? 500 : 600);
      x.fillStyle = col;
      x.textBaseline = 'middle';
      x.textAlign = 'left';
      if (r.l) x.fillText(r.l, padX, y);
      x.textAlign = 'center';
      if (r.c) x.fillText(r.c, S / 2, y);
      x.textAlign = 'right';
      if (r.r) x.fillText(r.r, S - padX, y);
    });

    /* scratchpad */
    x.fillStyle = 'rgba(255,255,255,0.06)';
    x.fillRect(0, H - rowH * 1.25, S, rowH * 1.25);
    x.font = mono(big, 700);
    x.textAlign = 'left';
    x.fillStyle = this.message ? AMBER : WHITE;
    x.fillText(this.message || this.scratch, padX, H - rowH * 0.62);
    if (!this.message) {
      x.fillStyle = MAGENTA;
      x.fillRect(padX + x.measureText(this.scratch).width + 3, H - rowH * 0.95, big * 0.5, big * 0.66);
    }

    this.t.needsUpdate = true;
    this.dirty = false;
  }
}

export { COLS, ROWS };
