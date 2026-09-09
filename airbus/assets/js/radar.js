/* ═══════════════════════════════════════════════════════════
   radar.js — a globe with real aircraft on it.

   Live positions come from the OpenSky Network's public REST
   API, used anonymously and within its published rate limits:
   one request every fifteen seconds, no key, no scraping, no
   attempt to get around anything. Every marker on the globe in
   LIVE mode is an aircraft that a receiver actually heard.

   What that endpoint does *not* return is the aircraft type. It
   gives identity, position, altitude, track and speed, and
   nothing about the airframe. So the type filters are switched
   off in LIVE mode and say why, rather than guessing an A320
   from a callsign — inventing an aircraft type and drawing it
   over a real position would be worse than admitting the gap.
   Selecting a track asks the metadata endpoint for that one
   aircraft, and shows the answer only if it comes back.

   When the API cannot be reached the globe drops to DEMO MODE,
   which is labelled as such everywhere it is visible. Demo
   traffic flies real great circles between real airports and is
   generated locally; it is not, and is never presented as, a
   real aircraft position.

   The coastlines are Natural Earth data, drawn once into a
   texture at build time.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.min.js';
import { Stage, renderer } from './world.js';
import { land, borders } from '../data/coastline.js';
import { AIRPORTS, gcDistance, gcBearing } from './mcdu.js';
import { audio } from './audio.js';
import { $, $$, magnetise, toast, cursor } from './ui.js';
import {
  loop, bus, clamp, lerp, damp, dampAngle, makeRandom, pointer, env, quality, deg, rad2deg, pad, fmt
} from './core.js';

const R = 100;                          /* globe radius in scene units */
const OPENSKY = 'https://opensky-network.org/api/states/all';
const POLL_MS = 15000;

/* Airbus families, and the ICAO type designators that belong to
   each. Used only where a type is actually known. */
const FAMILY_TYPES = {
  'A220': ['BCS1', 'BCS3', 'A220'],
  'A320 FAMILY': ['A318', 'A319', 'A320', 'A321', 'A19N', 'A20N', 'A21N'],
  'A330': ['A332', 'A333', 'A338', 'A339', 'A337'],
  'A340': ['A342', 'A343', 'A345', 'A346'],
  'A350': ['A359', 'A35K'],
  'A380': ['A388']
};
const AIRBUS_TYPES = new Set(Object.values(FAMILY_TYPES).flat());
const familyOf = (t) => {
  if (!t) return null;
  for (const [f, list] of Object.entries(FAMILY_TYPES)) if (list.includes(t)) return f;
  return null;
};

/* ── globe texture ───────────────────────────────────────── */

function globeTexture() {
  const W = quality.tier === 2 ? 4096 : 2048;
  const H = W / 2;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');

  const px = (lon) => ((lon + 180) / 360) * W;
  const py = (lat) => ((90 - lat) / 180) * H;

  /* ocean */
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#050b16');
  g.addColorStop(0.5, '#071427');
  g.addColorStop(1, '#050b16');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);

  /* graticule */
  x.strokeStyle = 'rgba(60,110,160,0.16)';
  x.lineWidth = Math.max(1, W / 2048);
  for (let lon = -180; lon <= 180; lon += 15) {
    x.beginPath(); x.moveTo(px(lon), 0); x.lineTo(px(lon), H); x.stroke();
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    x.beginPath(); x.moveTo(0, py(lat)); x.lineTo(W, py(lat)); x.stroke();
  }
  x.strokeStyle = 'rgba(80,150,210,0.32)';
  x.beginPath(); x.moveTo(0, py(0)); x.lineTo(W, py(0)); x.stroke();

  /* land */
  const rings = land();
  x.fillStyle = 'rgba(18,38,58,0.94)';
  x.beginPath();
  for (const r of rings) {
    for (let i = 0; i < r.length; i += 2) {
      const X = px(r[i]), Y = py(r[i + 1]);
      i === 0 ? x.moveTo(X, Y) : x.lineTo(X, Y);
    }
    x.closePath();
  }
  x.fill();

  /* coastline, twice: a wide soft pass for the glow and a fine
     one on top for the edge */
  for (const [w, col] of [[W / 340, 'rgba(34,211,238,0.16)'], [Math.max(1, W / 2400), 'rgba(120,225,255,0.85)']]) {
    x.strokeStyle = col;
    x.lineWidth = w;
    x.beginPath();
    for (const r of rings) {
      for (let i = 0; i < r.length; i += 2) {
        const X = px(r[i]), Y = py(r[i + 1]);
        i === 0 ? x.moveTo(X, Y) : x.lineTo(X, Y);
      }
      x.closePath();
    }
    x.stroke();
  }

  /* country borders, faint */
  x.strokeStyle = 'rgba(90,160,200,0.30)';
  x.lineWidth = Math.max(1, W / 3400);
  x.beginPath();
  for (const b of borders()) {
    for (let i = 0; i < b.length; i += 2) {
      const X = px(b[i]), Y = py(b[i + 1]);
      i === 0 ? x.moveTo(X, Y) : x.lineTo(X, Y);
    }
  }
  x.stroke();

  /* the airports the flight plan knows about */
  x.fillStyle = 'rgba(255,190,80,0.9)';
  for (const [, , lat, lon] of AIRPORTS) {
    x.beginPath();
    x.arc(px(lon), py(lat), Math.max(1.5, W / 900), 0, Math.PI * 2);
    x.fill();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = quality.anisotropy;
  return t;
}

const toVec = (lat, lon, alt = 0, out = new THREE.Vector3()) => {
  const φ = lat * deg, λ = lon * deg;
  const r = R + alt;
  return out.set(r * Math.cos(φ) * Math.cos(λ), r * Math.sin(φ), -r * Math.cos(φ) * Math.sin(λ));
};

/* ── demo traffic ────────────────────────────────────────── */

/* Clearly synthetic. Every one flies a real great circle between
   two real airports at a plausible speed and altitude, so the
   globe behaves the way the live one does — but nothing here is
   presented as a real aircraft. */
function demoTraffic(n = 420) {
  const rnd = makeRandom(20260909);
  const types = Object.entries(FAMILY_TYPES);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = AIRPORTS[Math.floor(rnd() * AIRPORTS.length)];
    let b = AIRPORTS[Math.floor(rnd() * AIRPORTS.length)];
    if (b === a) b = AIRPORTS[(AIRPORTS.indexOf(a) + 7) % AIRPORTS.length];
    const dist = gcDistance(a[2], a[3], b[2], b[3]);
    if (dist < 250) { i--; continue; }
    const [family, list] = types[Math.floor(rnd() * types.length)];
    const type = list[Math.floor(rnd() * list.length)];
    const airline = ['AFR', 'BAW', 'DLH', 'KLM', 'IBE', 'THY', 'UAE', 'QTR', 'SIA', 'ANA', 'AAL', 'ACA'][Math.floor(rnd() * 12)];
    out.push({
      id: 'DEMO' + pad(i, 4),
      callsign: airline + pad(Math.floor(rnd() * 900) + 100, 3),
      type, family,
      from: a, to: b,
      dist,
      t: rnd(),
      speed: (430 + rnd() * 90) / dist,      /* fraction of the leg per hour */
      alt: 9000 + rnd() * 3400,
      demo: true
    });
  }
  return out;
}

function demoState(f, hours) {
  let t = (f.t + f.speed * hours) % 1;
  const { lat, lon } = interp(f.from[2], f.from[3], f.to[2], f.to[3], t);
  const ahead = interp(f.from[2], f.from[3], f.to[2], f.to[3], Math.min(1, t + 0.004));
  const climb = Math.min(t, 1 - t) * 12;
  return {
    lat, lon,
    alt: f.alt * clamp(climb, 0.05, 1),
    heading: gcBearing(lat, lon, ahead.lat, ahead.lon),
    speed: 430 + Math.sin(t * 9) * 20,
    t
  };
}

function interp(lat1, lon1, lat2, lon2, f) {
  const φ1 = lat1 * deg, λ1 = lon1 * deg, φ2 = lat2 * deg, λ2 = lon2 * deg;
  const d = gcDistance(lat1, lon1, lat2, lon2) * 1.852 / 6371;
  if (d < 1e-6) return { lat: lat1, lon: lon1 };
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  return { lat: Math.atan2(z, Math.hypot(x, y)) * rad2deg, lon: Math.atan2(y, x) * rad2deg };
}

/* ── stage ───────────────────────────────────────────────── */

export class RadarStage extends Stage {
  constructor(app) {
    super('radar');
    this.app = app;
    this.mode = 'connecting';
    this.tracks = [];
    this.shown = [];
    this.selected = null;
    this.following = false;
    this.filters = new Set(['airbus']);
    this.search = '';
    this.spin = { yaw: 0.6, tYaw: 0.6, pitch: 0.25, tPitch: 0.25, dist: 300, tDist: 300 };
    this.grade = { bloom: 0.62, grain: 0.05, vignette: 0.46, dof: 0, focus: 300, range: 400, exposure: 1 };
    this.demoClock = 0;
  }

  build() {
    this.scene.background = new THREE.Color(0x02040a);

    /* the globe */
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(R, 96, 64),
      new THREE.MeshStandardMaterial({
        map: globeTexture(),
        roughness: 0.92, metalness: 0.05,
        emissive: 0x14304c, emissiveIntensity: 0.9
      })
    );
    this.globe = globe;
    this.scene.add(globe);

    /* atmosphere: a slightly larger sphere lit only at the rim */
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.055, 64, 40),
      new THREE.ShaderMaterial({
        transparent: true, side: THREE.BackSide, depthWrite: false,
        uniforms: { uColor: { value: new THREE.Color(0x2b8cff) } },
        vertexShader: `
          varying vec3 vN; varying vec3 vP;
          void main(){ vN = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz;
            gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `
          precision highp float;
          uniform vec3 uColor; varying vec3 vN; varying vec3 vP;
          void main(){
            float rim = pow(1.0 - abs(dot(normalize(vN), normalize(-vP))), 3.2);
            gl_FragColor = vec4(uColor * rim * 2.4, rim * 0.85);
          }`
      })
    );
    this.scene.add(atmo);

    /* a faint grid shell, which is what makes it read as an
       operations display rather than as a planet */
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.002, 48, 32),
      new THREE.MeshBasicMaterial({ color: 0x1c4a72, wireframe: true, transparent: true, opacity: 0.10 })
    );
    this.scene.add(shell);

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.25));
    const key = new THREE.DirectionalLight(0xbcd8ff, 2.0);
    key.position.set(1, 0.6, 1).multiplyScalar(400);
    this.scene.add(key);

    /* markers: one instanced arrow for everything on the globe */
    const arrow = new THREE.BufferGeometry();
    arrow.setAttribute('position', new THREE.Float32BufferAttribute(
      [0, 0, -1.9, -1.1, 0, 1.0, 1.1, 0, 1.0, 0, 0, -1.9, 0, 0.55, 0.6, -1.1, 0, 1.0, 0, 0, -1.9, 1.1, 0, 1.0, 0, 0.55, 0.6], 3));
    arrow.computeVertexNormals();
    this.MAX = 2600;
    this.markers = new THREE.InstancedMesh(
      arrow,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.96, toneMapped: false }),
      this.MAX
    );
    this.markers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.MAX * 3), 3);
    this.markers.count = 0;
    this.markers.frustumCulled = false;
    this.scene.add(this.markers);

    /* the selected aircraft's track */
    this.trail = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(new Array(140).fill(new THREE.Vector3())),
      new THREE.LineBasicMaterial({ color: 0x2b8cff, transparent: true, opacity: 0.9 })
    );
    this.trail.frustumCulled = false;
    this.trail.visible = false;
    this.scene.add(this.trail);

    /* the great circle it is flying, when the data supports one */
    this.route = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(new Array(80).fill(new THREE.Vector3())),
      new THREE.LineDashedMaterial({ color: 0xff5cf0, dashSize: 2.4, gapSize: 1.8, transparent: true, opacity: 0.8 })
    );
    this.route.frustumCulled = false;
    this.route.visible = false;
    this.scene.add(this.route);

    this.camera.near = 1;
    this.camera.far = 4000;
    this.camera.fov = 38;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points = { threshold: 3 };

    this._bindUI();
    this._connect();
  }

  /* ── data ──────────────────────────────────────────────── */

  async _connect() {
    this._setSource('connecting', 'CONNECTING…');
    try {
      const res = await fetch(OPENSKY, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      this._ingest(data);
      this.mode = 'live';
      this._setSource('live', 'LIVE · OPENSKY NETWORK');
      this._poll = setInterval(() => this._refresh(), POLL_MS);
    } catch (err) {
      /* Blocked, offline, rate-limited or CORS-refused — all the
         same to the visitor, and all handled the same way. */
      this.mode = 'demo';
      this.demo = demoTraffic();
      this._setSource('demo', 'DEMO MODE · SIMULATED TRAFFIC');
      toast('LIVE DATA UNAVAILABLE — SHOWING CLEARLY-LABELLED DEMO TRAFFIC', 5200);
    }
    this._applyFilters();
  }

  async _refresh() {
    if (this.mode !== 'live' || !this.active) return;
    try {
      const res = await fetch(OPENSKY, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      this._ingest(await res.json());
      this._applyFilters();
    } catch { /* one missed poll is not worth telling anyone about */ }
  }

  /* OpenSky state vectors, by index:
     0 icao24 · 1 callsign · 2 origin country · 3 time position
     5 longitude · 6 latitude · 7 barometric altitude
     8 on ground · 9 velocity (m/s) · 10 true track · 11 vertical rate
     13 geometric altitude */
  _ingest(data) {
    const states = data?.states || [];
    const out = [];
    for (const s of states) {
      const lon = s[5], lat = s[6];
      if (lat == null || lon == null) continue;
      out.push({
        id: s[0],
        callsign: (s[1] || '').trim() || s[0].toUpperCase(),
        country: s[2] || '—',
        lon, lat,
        alt: (s[13] ?? s[7] ?? 0),
        onGround: !!s[8],
        speed: s[9] != null ? s[9] * 1.94384 : null,   /* m/s → knots */
        heading: s[10] ?? 0,
        vrate: s[11] != null ? s[11] * 196.85 : null,  /* m/s → ft/min */
        type: null,                                    /* not supplied by this endpoint */
        family: null,
        demo: false
      });
      if (out.length >= this.MAX) break;
    }
    this.tracks = out;
    this.stamp = data?.time ? new Date(data.time * 1000) : new Date();
  }

  /* One metadata request, for one aircraft, only when a visitor
     asks about it. If it comes back the real type is shown; if
     it does not, the panel says the type is unavailable rather
     than filling the gap with a guess. */
  async _resolveType(track) {
    if (track.type || track.demo || track._tried) return;
    track._tried = true;
    try {
      const res = await fetch(`https://opensky-network.org/api/metadata/aircraft/icao/${track.id}`, { cache: 'force-cache' });
      if (!res.ok) return;
      const m = await res.json();
      const code = (m.typecode || '').toUpperCase();
      if (!code) return;
      track.type = code;
      track.family = familyOf(code);
      track.model = m.model || null;
      track.operator = m.operator || m.owner || null;
      if (this.selected === track) this._fillCard(track);
      this._applyFilters();
    } catch { /* metadata is a bonus, not a requirement */ }
  }

  _setSource(kind, text) {
    const el = $('#radar-src');
    el.className = 'src ' + kind;
    el.querySelector('span').textContent = text;
  }

  /* ── UI ────────────────────────────────────────────────── */

  _bindUI() {
    const ui = $('#radar-ui');
    magnetise(ui);

    for (const b of $$('#radar-filters .fchip')) {
      b.addEventListener('click', () => {
        const f = b.dataset.filter;
        if (this.filters.has(f)) this.filters.delete(f); else this.filters.add(f);
        b.classList.toggle('on', this.filters.has(f));
        if (this.mode === 'live' && f !== 'airbus') {
          toast('TYPE IS NOT SUPPLIED BY THE LIVE FEED — THIS FILTER ONLY APPLIES IN DEMO MODE', 4600);
        }
        this._applyFilters();
      });
    }
    $('#radar-search').addEventListener('input', (e) => {
      this.search = e.target.value.trim().toUpperCase();
      this._applyFilters();
    });
    $('#fc-close').addEventListener('click', () => this._select(null));
    $('#fc-follow').addEventListener('click', () => {
      this.following = !this.following;
      $('#fc-follow').querySelector('span').textContent = this.following ? 'STOP FOLLOWING' : 'FOLLOW';
      audio.click(1.0, 0.2);
    });

    const dom = renderer.domElement;
    let dragging = false, lx = 0, ly = 0, moved = 0;
    dom.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      dragging = true; lx = e.clientX; ly = e.clientY; moved = 0;
      this.following = false;
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      if (!dragging) { this._hover(e); return; }
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      this.spin.tYaw -= dx * 0.0042;
      this.spin.tPitch = clamp(this.spin.tPitch + dy * 0.0038, -1.35, 1.35);
    });
    window.addEventListener('pointerup', (e) => {
      if (dragging && moved < 6 && this.active) this._pick(e);
      dragging = false;
    });
    dom.addEventListener('wheel', (e) => {
      if (!this.active) return;
      e.preventDefault();
      this.spin.tDist = clamp(this.spin.tDist * (1 + Math.sign(e.deltaY) * 0.10), 118, 900);
    }, { passive: false });
  }

  _applyFilters() {
    const airbusOnly = this.filters.has('airbus');
    const fams = [...this.filters].filter((f) => f !== 'airbus');
    const q = this.search;

    this.shown = this.tracksNow().filter((t) => {
      if (q && !(t.callsign.includes(q) || t.id.toUpperCase().includes(q))) return false;
      /* In live mode there is no type, so a type filter cannot be
         applied honestly — everything passes and the panel says
         why. In demo mode the type is known and the filter bites. */
      if (t.type || t.demo) {
        if (airbusOnly && !AIRBUS_TYPES.has(t.type)) return false;
        if (fams.length && !fams.includes(t.family)) return false;
      }
      return true;
    });

    $('#radar-shown').textContent = fmt(this.shown.length);
    $('#radar-total').textContent = fmt(this.tracksNow().length);
    this._list();
    for (const b of $$('#radar-filters .fchip')) {
      const f = b.dataset.filter;
      b.style.opacity = (this.mode === 'live' && f !== 'airbus') ? 0.45 : 1;
      b.title = (this.mode === 'live' && f !== 'airbus')
        ? 'Aircraft type is not supplied by the live feed'
        : '';
    }
  }

  tracksNow() {
    if (this.mode !== 'demo') return this.tracks;
    return this.demo.map((f) => {
      const s = demoState(f, this.demoClock);
      return { ...f, ...s, onGround: false, country: f.from[1], vrate: 0 };
    });
  }

  _list() {
    const rows = this.shown.slice(0, 60).map((t) => `
      <li data-id="${t.id}" class="${this.selected?.id === t.id ? 'on' : ''}">
        <span class="rl-call">${t.callsign}</span>
        <span class="rl-type">${t.type || (t.demo ? '' : '—')}</span>
        <span class="rl-meta">${Math.round(t.alt / 0.3048 / 100) * 100} FT · ${Math.round(t.speed || 0)} KT</span>
        <span class="rl-meta" style="text-align:right">${pad(t.heading, 3)}°</span>
      </li>`).join('');
    const list = $('#radar-list');
    list.innerHTML = rows || '<li><span class="rl-meta">NO TRACKS MATCH THESE FILTERS</span></li>';
    for (const li of list.children) {
      li.addEventListener('click', () => {
        const t = this.shown.find((s) => s.id === li.dataset.id);
        if (t) this._select(t);
      });
    }
  }

  _hover(e) {
    const t = this._trackAt(e);
    if (t) cursor.hot(t.callsign); else cursor.cool();
  }

  _trackAt(e) {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = -((e.clientY / window.innerHeight) * 2 - 1);
    this.raycaster.setFromCamera({ x: nx, y: ny }, this.camera);
    const hit = this.raycaster.intersectObject(this.markers, false)[0];
    if (!hit) return null;
    return this.shown[hit.instanceId] || null;
  }

  _pick(e) {
    const t = this._trackAt(e);
    this._select(t);
  }

  _select(t) {
    this.selected = t;
    this.trail.visible = !!t;
    this.route.visible = false;
    this._trailPts = [];
    if (!t) {
      $('#flight-card').hidden = true;
      this.following = false;
      this._list();
      return;
    }
    audio.click(0.9, 0.24);
    this._fillCard(t);
    $('#flight-card').hidden = false;
    if (!t.demo) this._resolveType(t);
    if (t.demo) this._drawRoute(t);
    this._list();
  }

  _fillCard(t) {
    $('#fc-call').textContent = t.callsign;
    $('#fc-type').textContent = t.type
      ? `${t.type}${t.family ? ' · ' + t.family : ''}`
      : t.demo ? 'DEMO' : 'TYPE NOT SUPPLIED BY FEED';
    $('#fc-from').textContent = t.demo ? t.from[0] : '—';
    $('#fc-to').textContent = t.demo ? t.to[0] : '—';
    const ft = (m) => `${fmt(Math.round(m / 0.3048 / 100) * 100)} FT`;
    const rows = [
      ['ALTITUDE', t.onGround ? 'ON GROUND' : ft(t.alt)],
      ['SPEED', t.speed != null ? `${Math.round(t.speed)} KT` : '—'],
      ['HEADING', `${pad(t.heading, 3)}°`],
      ['VERT RATE', t.vrate != null ? `${Math.round(t.vrate / 50) * 50} FT/MIN` : '—'],
      ['POSITION', `${t.lat.toFixed(3)}° ${t.lon.toFixed(3)}°`],
      ['ICAO 24', t.id.toUpperCase()],
      [t.demo ? 'ROUTE' : 'COUNTRY', t.demo ? `${t.from[1]} → ${t.to[1]}` : t.country],
      ['STATUS', t.demo ? 'SIMULATED' : t.onGround ? 'ON GROUND' : 'AIRBORNE']
    ];
    if (t.operator) rows.splice(6, 0, ['OPERATOR', t.operator]);
    $('#fc-grid').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  }

  _drawRoute(t) {
    const pts = [];
    for (let i = 0; i <= 79; i++) {
      const p = interp(t.from[2], t.from[3], t.to[2], t.to[3], i / 79);
      pts.push(toVec(p.lat, p.lon, 1.2));
    }
    this.route.geometry.setFromPoints(pts);
    this.route.computeLineDistances();
    this.route.visible = true;
  }

  /* ── lifecycle ─────────────────────────────────────────── */

  enter() {
    $('#radar-ui').hidden = false;
    this._applyFilters();
  }

  exit() {
    $('#radar-ui').hidden = true;
    cursor.cool();
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt, time) {
    if (this.mode === 'demo') this.demoClock += dt / 3600 * 90;   /* 90× real time */

    const s = this.spin;
    if (!this.following && this.mode !== 'connecting' && !env.reduced) s.tYaw += dt * 0.012;

    if (this.following && this.selected) {
      const t = this.tracksNow().find((k) => k.id === this.selected.id) || this.selected;
      this.selected = t;
      s.tYaw = -t.lon * deg - Math.PI / 2;
      s.tPitch = t.lat * deg;
      s.tDist = clamp(s.tDist, 118, 220);
      this._fillCard(t);
    }

    s.yaw = dampAngle(s.yaw, s.tYaw, 3.2, dt);
    s.pitch = damp(s.pitch, s.tPitch, 3.2, dt);
    s.dist = damp(s.dist, s.tDist, 3.4, dt);

    const cp = Math.cos(s.pitch);
    this.camera.position.set(
      Math.cos(s.yaw) * cp * s.dist,
      Math.sin(s.pitch) * s.dist,
      Math.sin(s.yaw) * cp * s.dist
    );
    this.camera.lookAt(0, 0, 0);

    this._draw(dt);
    void time;
  }

  _draw(dt) {
    if (this.mode === 'demo') this.shown = this._filterList(this.tracksNow());

    const m = this.markers;
    const n = Math.min(this.shown.length, this.MAX);
    m.count = n;

    /* Scratch objects live on the stage rather than in the loop:
       at 2 600 markers a frame, allocating a Vector3 per axis is
       ten thousand objects a frame for the collector to find. */
    const S = this._scratch || (this._scratch = {
      mat: new THREE.Matrix4(), q: new THREE.Quaternion(),
      up: new THREE.Vector3(), north: new THREE.Vector3(), east: new THREE.Vector3(),
      fwd: new THREE.Vector3(), right: new THREE.Vector3(), pos: new THREE.Vector3(),
      scale: new THREE.Vector3(), col: new THREE.Color(), basis: new THREE.Matrix4()
    });
    const { mat, q, up, north, east, fwd, right, pos, scale, col, basis } = S;
    const scl = clamp(this.spin.dist / 300, 0.45, 1.6);

    for (let i = 0; i < n; i++) {
      const t = this.shown[i];
      /* Altitude is exaggerated so a cruising aircraft is visibly
         off the surface; the number in the panel is the real one. */
      const h = clamp(t.alt / 12000, 0, 1) * 3.6 + 0.6;
      toVec(t.lat, t.lon, h, pos);

      up.copy(pos).normalize();
      north.set(0, 1, 0).addScaledVector(up, -up.y).normalize();
      east.crossVectors(north, up).normalize();
      const hdg = (t.heading || 0) * deg;
      fwd.copy(north).multiplyScalar(Math.cos(hdg)).addScaledVector(east, Math.sin(hdg)).normalize();
      right.crossVectors(up, fwd).normalize();
      basis.makeBasis(right, up, fwd);
      q.setFromRotationMatrix(basis);
      scale.setScalar(this.selected?.id === t.id ? 2.0 * scl : 1.05 * scl);
      mat.compose(pos, q, scale);
      m.setMatrixAt(i, mat);

      if (this.selected?.id === t.id) col.setHex(0x2b8cff);
      else if (t.onGround) col.setHex(0x6c7a8a);
      else if (t.family) col.setHex(0x3ddc97);
      else col.setHex(0xdfe8f4);
      m.setColorAt(i, col);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;

    /* the selected aircraft's own track, accumulated live */
    if (this.selected) {
      const t = this.shown.find((k) => k.id === this.selected.id) || this.selected;
      this._trailPts = this._trailPts || [];
      const last = this._trailPts[this._trailPts.length - 1];
      const h = clamp(t.alt / 12000, 0, 1) * 3.6 + 0.6;
      const p = toVec(t.lat, t.lon, h);
      if (!last || last.distanceTo(p) > 0.35) {
        this._trailPts.push(p);
        if (this._trailPts.length > 140) this._trailPts.shift();
        if (this._trailPts.length > 1) {
          this.trail.geometry.setFromPoints(this._trailPts);
          this.trail.geometry.computeBoundingSphere();
        }
      }
      this.trail.visible = this._trailPts.length > 1;
    }
    void dt;
  }

  _filterList(list) {
    const airbusOnly = this.filters.has('airbus');
    const fams = [...this.filters].filter((f) => f !== 'airbus');
    const q = this.search;
    return list.filter((t) => {
      if (q && !(t.callsign.includes(q) || t.id.toUpperCase().includes(q))) return false;
      if (t.type || t.demo) {
        if (airbusOnly && !AIRBUS_TYPES.has(t.type)) return false;
        if (fams.length && !fams.includes(t.family)) return false;
      }
      return true;
    });
  }
}
