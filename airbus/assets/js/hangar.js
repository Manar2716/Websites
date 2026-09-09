/* ═══════════════════════════════════════════════════════════
   hangar.js — eight aircraft in one building, and the two ways
   to look at them.

   The stage has two camera modes that share the same scene:
   an orbit rig for choosing, and the first-person controller for
   walking. Switching between them is a camera interpolation, not
   a scene change — the aircraft you were orbiting is the one you
   are standing under a second later.

   Everything except the selected aircraft is built in reduced
   detail. Selecting one promotes it to the full model, which is
   cached, so going back to an aircraft you have already looked
   at costs nothing.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.min.js';
import { Stage, attachSky, claimSky, sky, renderer } from './world.js';
import { buildAircraft } from './build.js';
import { buildCabin } from './cabin.js';
import { WalkController, EYE } from './walk.js';
import { FLEET, byId, COMPONENTS } from './fleet.js';
import { makeClouds } from './scenery.js';
import { audio } from './audio.js';
import { $, $$, magnetise, toast, ComponentPanel, cursor } from './ui.js';
import {
  loop, bus, clamp, lerp, damp, dampAngle, pointer, env, quality, deg, fmt, easeInOutCubic
} from './core.js';

const ROWS = [
  { z: -95, ids: ['a220', 'a319', 'a320', 'a321'] },
  { z: 95, ids: ['a330', 'a340', 'a350', 'a380'] }
];

/* ── the building ────────────────────────────────────────── */

function concreteTexture() {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#3d434b';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 26000; i++) {
    const a = Math.random() * 0.05;
    x.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},${a})`;
    x.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  /* expansion joints — the grid that gives a floor its scale */
  x.strokeStyle = 'rgba(18,20,24,0.55)';
  x.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    const p = (i / 4) * S;
    x.beginPath(); x.moveTo(p, 0); x.lineTo(p, S); x.stroke();
    x.beginPath(); x.moveTo(0, p); x.lineTo(S, p); x.stroke();
  }
  /* the yellow guidance line every apron has */
  x.strokeStyle = 'rgba(228,190,60,0.75)';
  x.lineWidth = 7;
  x.beginPath(); x.moveTo(0, S * 0.5); x.lineTo(S, S * 0.5); x.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = quality.anisotropy;
  return t;
}

function buildHangar(W, D, H) {
  const g = new THREE.Group();
  const half = { x: W / 2, z: D / 2 };

  const floorTex = concreteTexture();
  floorTex.repeat.set(W / 60, D / 60);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, D),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.62, metalness: 0.04, envMapIntensity: 0.4 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);

  const shell = new THREE.MeshStandardMaterial({ color: 0x2b3138, roughness: 0.88, metalness: 0.12, side: THREE.DoubleSide });
  const rib = new THREE.MeshStandardMaterial({ color: 0x4c545e, roughness: 0.55, metalness: 0.6 });

  /* Back and side walls. The front is left open to a sunset,
     which is where all the warm light in here comes from. */
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), shell);
  back.position.set(0, H / 2, -half.z);
  g.add(back);
  for (const sx of [1, -1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(D, H), shell);
    wall.rotation.y = -sx * Math.PI / 2;
    wall.position.set(sx * half.x, H / 2, 0);
    g.add(wall);
  }

  /* A barrel roof rather than a flat one, so the space reads as
     a hangar and the trusses have something to follow. */
  const arc = [];
  const rise = H * 0.30;
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    arc.push(new THREE.Vector2(lerp(-half.x, half.x, t), H + Math.sin(t * Math.PI) * rise));
  }
  {
    const pos = [], idx = [];
    for (let i = 0; i < arc.length; i++) {
      pos.push(arc[i].x, arc[i].y, -half.z, arc[i].x, arc[i].y, half.z);
    }
    for (let i = 0; i < arc.length - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const roof = new THREE.BufferGeometry();
    roof.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    roof.setIndex(idx);
    roof.computeVertexNormals();
    const m = new THREE.Mesh(roof, shell);
    m.material = shell;
    g.add(m);
  }

  /* trusses and the light bars slung under them */
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xcfe4ff });
  const trussCount = 11;
  for (let t = 0; t < trussCount; t++) {
    const z = lerp(-half.z + 14, half.z - 14, t / (trussCount - 1));
    const pts = arc.map((p) => new THREE.Vector3(p.x, p.y - 1.6, z));
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x5a636d }));
    g.add(line);

    for (let k = 1; k < 8; k++) {
      const x = lerp(-half.x * 0.86, half.x * 0.86, k / 8);
      const y = H + Math.sin(((x + half.x) / W) * Math.PI) * rise - 3.4;
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(9, 0.5, 1.6), lampMat);
      lamp.position.set(x, y, z);
      g.add(lamp);
      const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 6), rib);
      hanger.position.set(x, y + 1.7, z);
      g.add(hanger);
    }
  }

  /* the front frame: two piers and a header, so the opening
     reads as a door and not as a missing wall */
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x333a42, roughness: 0.8, metalness: 0.2 });
  for (const sx of [1, -1]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(16, H, 6), pierMat);
    pier.position.set(sx * (half.x - 8), H / 2, half.z);
    pier.castShadow = true;
    g.add(pier);
  }
  const header = new THREE.Mesh(new THREE.BoxGeometry(W, 9, 6), pierMat);
  header.position.set(0, H - 4.5, half.z);
  header.castShadow = true;
  g.add(header);

  /* wall structure, purely so the eye has something to measure
     the building against */
  for (let i = 1; i < 14; i++) {
    const x = lerp(-half.x, half.x, i / 14);
    const col = new THREE.Mesh(new THREE.BoxGeometry(1.6, H, 1.2), rib);
    col.position.set(x, H / 2, -half.z + 0.8);
    g.add(col);
  }

  return { group: g, W, D, H, bounds: { minX: -half.x + 3, maxX: half.x - 3, minZ: -half.z + 3, maxZ: half.z + 140 } };
}

/* ── stage ───────────────────────────────────────────────── */

export class HangarStage extends Stage {
  constructor(app) {
    super('hangar');
    this.app = app;
    this.mode = 'orbit';                 /* orbit | walk | cabin */
    this.selected = null;
    this.full = new Map();
    this.slots = [];
    this.demoT = 0;
    this.demo = null;

    this.orbit = {
      target: new THREE.Vector3(0, 14, 0),
      tTarget: new THREE.Vector3(0, 14, 0),
      dist: 330, tDist: 330,
      yaw: -Math.PI / 2, tYaw: -Math.PI / 2,
      pitch: 0.20, tPitch: 0.20,
      fov: 42, tFov: 42
    };
    this.grade = { bloom: 0.40, grain: 0.05, vignette: 0.38, dof: 0.30, focus: 120, range: 220, exposure: 1.18 };
  }

  /* ── construction ──────────────────────────────────────── */

  build() {
    attachSky(this, { hour: 18.4 });
    sky.setTime(18.4);
    this.scene.environment = sky.environment();
    this.scene.fog = new THREE.FogExp2(0x3a4150, 0.0011);

    const H = buildHangar(430, 300, 52);
    this.hangar = H;
    this.scene.add(H.group);

    /* Light: one warm key through the open door, a cool fill
       from the roof, and a broad ambient. Point lights per lamp
       would cost more than they are worth — the lamps are
       emissive and the bloom does the rest. */
    this._relight();
    const roof = new THREE.DirectionalLight(0xbcd8ff, 1.6);
    roof.position.set(-40, 90, -60);
    this.scene.add(roof);
    const bounce = new THREE.HemisphereLight(0xa8c6ea, 0x4a5058, 2.4);
    this.scene.add(bounce);

    /* The lamps under the trusses are emissive panels, which
       makes them bloom but lights nothing. Six point lights on
       the same line do the actual work — shadowless, because a
       hangar's light is bounced and a hard second shadow under
       each aircraft would be a lie. */
    for (let i = 0; i < 6; i++) {
      const lamp = new THREE.PointLight(0xdcecff, 9000, 320, 2);
      lamp.position.set(lerp(-160, 160, (i % 3) / 2), 44, i < 3 ? -95 : 95);
      this.scene.add(lamp);
    }
    /* and a cool fill from the open front, which is what stops
       the noses going black against the sunset */
    const front = new THREE.DirectionalLight(0xffd8ae, 1.1);
    front.position.set(0, 30, 600);
    front.target.position.set(0, 8, 0);
    this.scene.add(front, front.target);

    /* the sky visible through the open front */
    this.clouds = makeClouds({ count: 60, base: 620, spread: 9000, thickness: 400, seed: 41 });
    this.clouds.mesh.position.set(0, 0, 2400);
    this.scene.add(this.clouds.mesh);

    this._layout();

    this.camera.near = 0.22;
    this.camera.far = 12000;
    this.raycaster = new THREE.Raycaster();
    this.walker = new WalkController(this.camera, renderer.domElement);
    this.walker.onInteract = () => this._interact();
    this.walker.onLockChange = (l) => {
      $('#reticle').style.opacity = l ? '' : '0.25';
      if (!l && this.mode !== 'orbit') $('#hangar-hint');
    };

    this.panel = new ComponentPanel(COMPONENTS);
    this._buildRail();
    this._bindUI();
    this.select('a350', { instant: true });
  }

  /* The shared sun is re-aimed for this room every time the
     stage is entered, because another stage will have moved it
     back into the sky in the meantime. */
  _relight() {
    const sun = this.sun;
    if (!sun) return;
    sun.position.set(60, 55, 520);
    sun.target.position.set(0, 8, 0);
    sun.intensity = 2.6;
    sun.color.setHex(0xffc98a);
    if (sun.shadow) {
      sun.shadow.camera.left = -240; sun.shadow.camera.right = 240;
      sun.shadow.camera.top = 200; sun.shadow.camera.bottom = -200;
      sun.shadow.camera.far = 900;
      sun.shadow.camera.updateProjectionMatrix();
    }
  }

  /* Aircraft are spaced by their own wingspans plus a constant
     clearance, which is how a real apron is marked out and why
     the A380 gets so much more room than the A220. */
  _layout() {
    for (const row of ROWS) {
      const spans = row.ids.map((id) => byId(id).spec.span);
      const total = spans.reduce((a, b) => a + b, 0) + (row.ids.length - 1) * 22;
      let x = -total / 2;
      row.ids.forEach((id, i) => {
        const type = byId(id);
        x += spans[i] / 2;
        const ac = buildAircraft(type, { detail: 'lod' });
        ac.group.position.set(x, ac.groundY, row.z);
        ac.group.rotation.y = row.z > 0 ? Math.PI : 0;
        this.scene.add(ac.group);
        this.slots.push({ id, type, x, z: row.z, rot: ac.group.rotation.y, ac, detail: 'lod' });
        x += spans[i] / 2 + 22;
      });
    }
  }

  /* Promote a slot to the full model. The reduced one stays in
     the map so switching back is instant. */
  _promote(slot) {
    if (slot.detail === 'full') return slot.ac;
    let full = this.full.get(slot.id);
    if (!full) {
      full = buildAircraft(slot.type);
      this.full.set(slot.id, full);
    }
    slot.ac.group.visible = false;
    full.group.position.copy(slot.ac.group.position);
    full.group.position.y = full.groundY;
    full.group.rotation.y = slot.rot;
    if (!full.group.parent) this.scene.add(full.group);
    full.group.visible = true;
    slot.lodAc = slot.ac;
    slot.ac = full;
    slot.detail = 'full';
    return full;
  }

  _demote(slot) {
    if (slot.detail !== 'full' || !slot.lodAc) return;
    slot.ac.group.visible = false;
    slot.lodAc.group.visible = true;
    slot.ac = slot.lodAc;
    slot.detail = 'lod';
  }

  /* ── UI ────────────────────────────────────────────────── */

  _buildRail() {
    const rail = $('#fleet-rail');
    rail.innerHTML = FLEET.map((a) => `
      <button class="fleet-chip" data-id="${a.id}" data-magnet role="tab" aria-selected="false">
        <b>${a.name}</b><span>${a.family}</span>
      </button>`).join('');
    for (const b of $$('.fleet-chip', rail)) {
      b.addEventListener('click', () => this.select(b.dataset.id));
    }
    magnetise(rail);
  }

  _bindUI() {
    $('#walk-btn').addEventListener('click', () => this.enterWalk());
    $('#board-btn').addEventListener('click', () => this.board());
    $('#walk-exit').addEventListener('click', () => this.exitWalk());
    magnetise($('#hangar-ui'));
    magnetise($('#walk-ui'));

    renderer.domElement.addEventListener('click', (e) => {
      if (this.mode !== 'orbit' || !this.active) return;
      this._pick(e);
    });
    renderer.domElement.addEventListener('pointermove', (e) => {
      if (this.mode !== 'orbit' || !this.active) return;
      this._hover(e);
    });

    /* orbit drag + wheel */
    const dom = renderer.domElement;
    let dragging = false, lx = 0, ly = 0;
    dom.addEventListener('pointerdown', (e) => {
      if (this.mode !== 'orbit' || !this.active) return;
      dragging = true; lx = e.clientX; ly = e.clientY;
      this._moved = 0;
    });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      this._moved += Math.abs(dx) + Math.abs(dy);
      this.orbit.tYaw -= dx * 0.004;
      this.orbit.tPitch = clamp(this.orbit.tPitch + dy * 0.003, -0.05, 0.72);
    });
    window.addEventListener('pointerup', () => { dragging = false; });
    dom.addEventListener('wheel', (e) => {
      if (this.mode !== 'orbit' || !this.active) return;
      e.preventDefault();
      this.orbit.tDist = clamp(this.orbit.tDist * (1 + Math.sign(e.deltaY) * 0.12), 22, 900);
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.key === 'Escape' && this.mode !== 'orbit') this.exitWalk();
    });
  }

  select(id, { instant = false } = {}) {
    const slot = this.slots.find((s) => s.id === id);
    if (!slot || this.selected?.id === id) return;
    if (this.selected && this.selected.id !== id) this._demote(this.selected);
    this.selected = slot;
    this._promote(slot);

    const a = slot.type;
    $('#hangar-name').textContent = a.name;
    $('#hangar-tag').textContent = a.tag;
    $('#sp-name').textContent = a.name;
    $('#sp-family').textContent = a.family;
    $('#sp-story').textContent = a.story;
    $('#sp-grid').innerHTML = [
      ['LENGTH', `${a.spec.length.toFixed(2)} m`],
      ['WINGSPAN', `${a.spec.span.toFixed(2)} m`],
      ['HEIGHT', `${a.spec.height.toFixed(2)} m`],
      ['RANGE', `${fmt(a.spec.rangeNmi)} nm · ${fmt(a.spec.rangeKm)} km`],
      ['CRUISE', `M ${a.spec.mach} · ${fmt(a.spec.cruiseKts)} kt`],
      ['CEILING', `${fmt(a.spec.ceiling)} ft`],
      ['SEATS', `${a.spec.seatsTypical} typical · ${a.spec.seatsMax} max`],
      ['MTOW', `${fmt(a.spec.mtow / 1000, 1)} t`],
      ['ENGINES', a.spec.engines],
      ['THRUST', `${a.spec.thrust} each`]
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    $('#spec-panel').hidden = false;

    for (const b of $$('.fleet-chip')) {
      const on = b.dataset.id === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    }

    /* fly to it rather than cut */
    const L = a.spec.length;
    const fit = this._fit();
    this.orbit.tTarget.set(slot.x, L * fit.up, slot.z);
    this.orbit.tDist = L * fit.dist;
    this.orbit.tYaw = slot.z > 0 ? Math.PI * 0.30 : -Math.PI * 0.70;
    this.orbit.tPitch = fit.pitch;
    this.orbit.tFov = fit.fov;
    this._tilt = fit.tilt;
    if (instant) {
      this.orbit.target.copy(this.orbit.tTarget);
      this.orbit.dist = this.orbit.tDist;
      this.orbit.yaw = this.orbit.tYaw;
      this.orbit.pitch = this.orbit.tPitch;
      this.orbit.fov = this.orbit.tFov;
    } else {
      audio.click(0.9, 0.26);
    }
    bus.emit('hangar:select', id);
  }

  /* ── modes ─────────────────────────────────────────────── */

  enterWalk() {
    if (!this.selected) return;
    const slot = this.selected;
    const ac = slot.ac;
    this.mode = 'walk';
    $('#hangar-ui').hidden = true;
    $('#walk-ui').hidden = false;
    $('#touch-move').hidden = !env.touch;
    $('#touch-run').hidden = !env.touch;
    $('#touch-act').hidden = !env.touch;
    this._buildColliders(slot);

    /* start off the left wingtip, facing the aircraft */
    const side = slot.z > 0 ? 1 : -1;
    const sx = slot.x - ac.semi * 0.85;
    const sz = slot.z + side * (ac.L * 0.30);
    this.walker.teleport(sx, sz, Math.atan2(slot.x - sx, slot.z - sz) + Math.PI, 0);
    this.walker.floorTarget = 0;
    this.walker.attach();
    this.walker.requestLock();
    this.grade.dof = 0.18; this.grade.focus = 14; this.grade.range = 40;
    this.camera.fov = 68;
    this.camera.updateProjectionMatrix();
    audio.room()?.set(0.6);
    toast('CLICK TO CAPTURE THE MOUSE · ESC TO RELEASE', 3200);
  }

  exitWalk() {
    this.mode = 'orbit';
    this.walker.detach();
    if (this.cabin) { this.cabin.visible = false; }
    $('#walk-ui').hidden = true;
    $('#hangar-ui').hidden = false;
    $('#prompt').hidden = true;
    this.panel.close();
    this.grade.dof = 0.30; this.grade.focus = 120; this.grade.range = 220;
    audio.room()?.set(0.2);
  }

  /* Collision volumes for one aircraft: the gear legs, the
     engines, and the fuselage only where it is low enough to
     matter. Everything else you can walk under, which is the
     whole reason to be down here. */
  _buildColliders(slot) {
    const ac = slot.ac;
    const list = [];
    const rot = slot.rot;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const toWorld = (lx, lz) => ({
      x: slot.x + lx * cos + lz * sin,
      z: slot.z - lx * sin + lz * cos
    });

    for (const leg of ac.parts.gearLegs) {
      const p = toWorld(leg.group.position.x, leg.group.position.z);
      list.push({ type: 'cyl', x: p.x, z: p.z, r: 1.5, y0: 0, y1: leg.height + ac.groundY });
    }
    for (const pod of ac.parts.engines) {
      const p = toWorld(pod.group.position.x, pod.group.position.z);
      const y = pod.group.position.y + ac.groundY;
      const r = ac.geo.nacD * ac.L * 0.5;
      list.push({ type: 'cyl', x: p.x, z: p.z, r: r * 1.05, y0: y - r, y1: y + r });
    }
    /* the fuselage, as a box along the aircraft's own axis */
    const belly = ac.groundY - ac.geo.fuseH / 2;
    list.push({
      type: 'box', x: slot.x, z: slot.z, rot,
      hx: ac.geo.fuseW / 2, hz: ac.L / 2,
      y0: Math.max(0, belly), y1: belly + ac.geo.fuseH
    });

    this.walker.setColliders(list, this.hangar.bounds);
    slot.colliders = list;
  }

  board() {
    if (!this.selected) return;
    const slot = this.selected;
    const ac = slot.ac;
    if (!slot.cabin) {
      slot.cabin = buildCabin(ac);
      ac.group.add(slot.cabin);
    }
    slot.cabin.visible = true;
    this.cabin = slot.cabin;
    this.mode = 'cabin';
    $('#hangar-ui').hidden = true;
    $('#walk-ui').hidden = false;
    $('#touch-move').hidden = !env.touch;
    $('#touch-run').hidden = !env.touch;
    $('#touch-act').hidden = !env.touch;

    /* cabin space is local to the aircraft; the walker works in
       world space, so the colliders are transformed once here */
    const cu = slot.cabin.userData;
    const rot = slot.rot, cos = Math.cos(rot), sin = Math.sin(rot);
    const list = cu.colliders.map((c) => {
      const x = slot.x + c.x * cos + c.z * sin;
      const z = slot.z - c.x * sin + c.z * cos;
      return { ...c, x, z, rot: (c.rot || 0) + rot, y0: c.y0 + ac.groundY, y1: c.y1 + ac.groundY };
    });
    this.walker.setColliders(list, null);

    /* Stand in the aisle, at the aft end, facing forward. The
       centreline of a 3-4-3 cabin is the middle seat bank, and
       teleporting bypasses collision — so putting the visitor at
       x = 0 puts them inside a row of seats. */
    const floorY = cu.floorY + ac.groundY;
    const entry = cu.z1 - 2.4;
    const aisle = (cu.aisles && cu.aisles.length) ? cu.aisles[0] : 0;
    const wx = slot.x + aisle * cos + entry * sin;
    const wz = slot.z - aisle * sin + entry * cos;
    this.walker.teleport(wx, wz, rot, floorY);
    this.walker.floorTarget = floorY;
    this.walker.attach();
    this.walker.requestLock();
    $('#wh-loc').textContent = 'CABIN';
    this.grade.dof = 0.28; this.grade.focus = 8; this.grade.range = 18;
    this.camera.fov = 72;
    this.camera.updateProjectionMatrix();
    ac.target.doorOpen = 1;
    audio.chime('ok');
    toast('WALK FORWARD TO THE FLIGHT DECK DOOR', 4200);
  }

  /* ── picking ───────────────────────────────────────────── */

  _ray(e) {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = -((e.clientY / window.innerHeight) * 2 - 1);
    this.raycaster.setFromCamera({ x: nx, y: ny }, this.camera);
    return this.raycaster.intersectObjects(this.scene.children, true);
  }

  _slotFor(obj) {
    let o = obj;
    while (o) {
      const s = this.slots.find((sl) => sl.ac.group === o || sl.lodAc?.group === o);
      if (s) return s;
      o = o.parent;
    }
    return null;
  }

  _componentFor(obj) {
    let o = obj;
    while (o) {
      if (o.userData?.component) return o.userData.component;
      o = o.parent;
    }
    return null;
  }

  _hover(e) {
    const hit = this._ray(e).find((h) => this._slotFor(h.object));
    if (!hit) { cursor.cool(); this._hoverSlot = null; return; }
    const slot = this._slotFor(hit.object);
    this._hoverSlot = slot;
    if (slot === this.selected) {
      const c = this._componentFor(hit.object);
      cursor.hot(c ? (COMPONENTS[c]?.name || c.toUpperCase()) : 'INSPECT');
    } else {
      cursor.hot(slot.type.name);
    }
  }

  _pick(e) {
    if (this._moved > 8) return;
    const hits = this._ray(e);
    const hit = hits.find((h) => this._slotFor(h.object));
    if (!hit) return;
    const slot = this._slotFor(hit.object);
    if (slot !== this.selected) { this.select(slot.id); return; }
    const c = this._componentFor(hit.object);
    if (c) this._openComponent(c);
  }

  /* ── component panel + demonstrations ──────────────────── */

  _openComponent(id) {
    this.panel.open(id, () => this._demonstrate(id));
    audio.click(0.85, 0.2);
  }

  _demonstrate(id) {
    const ac = this.selected?.ac;
    if (!ac) return;
    this.demo = { id, t: 0 };
    switch (id) {
      case 'engine': ac.target.n1 = 0.85; ac.target.reverse = 1; audio.servo(2.4, 120, 700); break;
      case 'wing': ac.target.flex = 1.6; break;
      case 'gear': ac.target.gear = ac.target.gear > 0.5 ? 0 : 1; audio.servo(4, 120, 520); break;
      case 'flaps': ac.target.flap = ac.target.flap > 0.5 ? 0 : 1; ac.target.slat = ac.target.flap; audio.servo(3.2, 220, 900); break;
      case 'rudder': ac.target.rudder = 1; break;
      case 'elevator': ac.target.elevator = -1; break;
      case 'aileron': ac.target.aileron = 1; ac.target.spoiler = 0.6; break;
      case 'door': ac.target.doorOpen = ac.target.doorOpen > 0.5 ? 0 : 1; audio.servo(1.8, 180, 620);
        if (ac.target.doorOpen) toast('DOOR OPEN — PRESS BOARD TO STEP INSIDE', 3400); break;
      case 'apu': audio.servo(4.5, 90, 420); ac.target.n1 = Math.max(ac.target.n1, 0.08);
        toast('APU RUNNING — ELECTRICAL AND BLEED AIR AVAILABLE', 3400); break;
      case 'cockpit': bus.emit('nav', 'cockpit'); return;
      case 'cabin': this.board(); return;
      default: break;
    }
  }

  /* ── walk-mode interaction ─────────────────────────────── */

  _nearest() {
    const ac = this.selected?.ac;
    if (!ac) return null;
    const slot = this.selected;
    const rot = slot.rot, cos = Math.cos(rot), sin = Math.sin(rot);
    const p = this.walker.pos;
    let best = null, bestD = 9e9;
    for (const h of ac.hotspots) {
      const wx = slot.x + h.position.x * cos + h.position.z * sin;
      const wz = slot.z - h.position.x * sin + h.position.z * cos;
      const wy = h.position.y + ac.groundY;
      const d = Math.hypot(wx - p.x, wz - p.z, (wy - p.y) * 0.5);
      if (d < bestD) { bestD = d; best = { ...h, wx, wy, wz, d }; }
    }
    return best && bestD < 11 ? best : null;
  }

  _interact() {
    if (this.mode === 'cabin') {
      const slot = this.selected;
      const cu = this.cabin?.userData;
      if (!cu) return;
      const rot = slot.rot;
      const dz = cu.deckDoorZ;
      const wx = slot.x + dz * Math.sin(rot);
      const wz = slot.z + dz * Math.cos(rot);
      if (Math.hypot(this.walker.pos.x - wx, this.walker.pos.z - wz) < 3.4) {
        bus.emit('nav', 'cockpit');
        return;
      }
      toast('WALK FORWARD TO THE FLIGHT DECK DOOR');
      return;
    }
    const near = this._nearest();
    if (!near) return;
    if (near.id === 'door') {
      this.selected.ac.target.doorOpen = 1;
      audio.servo(1.8, 180, 620);
      setTimeout(() => this.board(), 900);
      return;
    }
    if (near.id === 'cockpit') { bus.emit('nav', 'cockpit'); return; }
    this._openComponent(near.id);
  }

  /* ── lifecycle ─────────────────────────────────────────── */

  enter(opts = {}) {
    claimSky(this);
    this._relight();
    $('#hangar-ui').hidden = false;
    if (opts.type) this.select(opts.type);
    this.mode = 'orbit';
    audio.room()?.set(0.25);
  }

  exit() {
    $('#hangar-ui').hidden = true;
    $('#walk-ui').hidden = true;
    this.walker.detach();
    this.panel.close();
    audio.room()?.set(0);
  }

  /* A portrait phone sees a much narrower slice of the world
     than a laptop does at the same vertical field of view, so an
     aircraft framed for one is off both edges of the other.

     Backing the camera off is the obvious fix and the wrong one:
     an A350 needs nearly three hundred metres of standoff to fit
     a portrait frame, which puts the camera outside the back
     wall of the hangar looking at brickwork. Opening the field of
     view instead keeps it in the room. */
  _fit() {
    const aspect = this.camera.aspect || 1.78;
    const tight = clamp(1.62 / aspect, 1, 3.4);
    return tight > 1.6
      ? { dist: 1.22, fov: 58, up: 0.10, pitch: 0.13, tilt: 0.26 }
      : { dist: 1.55 * tight, fov: 40 + (tight - 1) * 18, up: 0.11, pitch: 0.16, tilt: 0 };
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.selected) {
      const L = this.selected.type.spec.length;
      const fit = this._fit();
      this.orbit.tDist = L * fit.dist;
      this.orbit.tTarget.y = L * fit.up;
      this.orbit.tPitch = fit.pitch;
      this.orbit.tFov = fit.fov;
    }
    this._tilt = this._fit().tilt;
  }

  update(dt, time) {
    for (const s of this.slots) s.ac.update(dt);
    if (this.selected?.lodAc && this.selected.detail === 'full') this.selected.lodAc.update(dt);

    /* let a demonstration play, then put the surface back */
    if (this.demo) {
      this.demo.t += dt;
      if (this.demo.t > 4.5) {
        const ac = this.selected.ac;
        ac.target.rudder = 0; ac.target.elevator = 0; ac.target.aileron = 0;
        ac.target.spoiler = 0; ac.target.flex = 0; ac.target.reverse = 0;
        if (this.demo.id === 'engine') ac.target.n1 = 0.08;
        this.demo = null;
      }
    }

    this.clouds.uniforms.uSun.value.copy(sky.uniforms.uSun.value);
    this.clouds.uniforms.uSunColor.value.setHex(0xffcf9c);

    if (this.mode === 'orbit') this._updateOrbit(dt, time);
    else this._updateWalk(dt);
  }

  _updateOrbit(dt, time) {
    const o = this.orbit;
    const k = env.reduced ? 40 : 2.4;
    o.target.lerp(o.tTarget, 1 - Math.exp(-k * dt));
    o.dist = damp(o.dist, o.tDist, k, dt);
    o.yaw = dampAngle(o.yaw, o.tYaw, k, dt);
    o.pitch = damp(o.pitch, o.tPitch, k, dt);
    o.fov = damp(o.fov, o.tFov, k, dt);

    /* a slow breath on the orbit so a still frame is never
       actually still */
    const drift = env.reduced ? 0 : Math.sin(time * 0.13) * 0.012;
    const yaw = o.yaw + drift + pointer.sx * 0.10;
    const pitch = clamp(o.pitch - pointer.sy * 0.05, -0.05, 0.85);

    const cp = Math.cos(pitch);
    const b = this.hangar.bounds;
    this.camera.position.set(
      clamp(o.target.x + Math.sin(yaw) * cp * o.dist, b.minX + 6, b.maxX - 6),
      clamp(o.target.y + Math.sin(pitch) * o.dist + 2, 2, this.hangar.H - 6),
      clamp(o.target.z + Math.cos(yaw) * cp * o.dist, b.minZ + 6, b.maxZ - 6)
    );
    this.camera.lookAt(o.target);
    /* On a portrait screen the lower half of the frame belongs to
       the specification panel, so the camera is tilted down and
       the aircraft rides in the top half where it can be seen. */
    if (this._tilt) this.camera.rotateX(-this._tilt);
    this.camera.fov = o.fov;
    this.camera.updateProjectionMatrix();
    this.grade.focus = o.dist;
    this.grade.range = o.dist * 1.6;
  }

  _updateWalk(dt) {
    this.walker.update(dt);
    const near = this.mode === 'walk' ? this._nearest() : null;
    const prompt = $('#prompt');
    const ret = $('#reticle');

    if (this.mode === 'cabin') {
      const slot = this.selected, cu = this.cabin?.userData;
      const rot = slot.rot;
      const wx = slot.x + cu.deckDoorZ * Math.sin(rot);
      const wz = slot.z + cu.deckDoorZ * Math.cos(rot);
      const d = Math.hypot(this.walker.pos.x - wx, this.walker.pos.z - wz);
      const on = d < 4.2;
      prompt.hidden = !on;
      if (on) $('#prompt-text').textContent = 'ENTER THE FLIGHT DECK';
      ret.classList.toggle('hot', on);
      $('#wh-dist').textContent = `${d.toFixed(0)} m TO FLIGHT DECK`;
      return;
    }

    if (near) {
      prompt.hidden = false;
      $('#prompt-text').textContent = near.id === 'door' ? 'BOARD THE AIRCRAFT'
        : near.id === 'cockpit' ? 'ENTER THE FLIGHT DECK'
        : `INSPECT ${near.label}`;
      ret.classList.add('hot');
      $('#wh-dist').textContent = `${near.d.toFixed(1)} m · ${near.label}`;
    } else {
      prompt.hidden = true;
      ret.classList.remove('hot');
      const slot = this.selected;
      const d = Math.hypot(this.walker.pos.x - slot.x, this.walker.pos.z - slot.z);
      $('#wh-dist').textContent = `${d.toFixed(0)} m FROM CENTRELINE`;
    }
    $('#wh-loc').textContent = this.mode === 'cabin' ? 'CABIN' : 'EXTERIOR';
  }
}
