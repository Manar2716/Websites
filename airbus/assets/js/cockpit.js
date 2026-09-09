/* ═══════════════════════════════════════════════════════════
   cockpit.js — an Airbus-style flight deck, built out of
   primitives and canvas silkscreen.

   The panels are textured boxes: every legend, bezel, guard and
   warning stripe is drawn into a canvas at build time, which is
   what makes the deck read as an instrument panel rather than as
   grey boxes. The controls on top of them are real geometry —
   buttons that travel, switches that throw, knobs that turn,
   levers that move through a slot — and each one is wired to the
   flight model. Nothing here is painted on and dead.

   Two devices are handled by texture rather than by geometry:
   the MCDU keypads and the display bezels. A raycast returns the
   UV it hit, so seventy keys cost one mesh and one hit test
   instead of seventy of each.

   Local frame: origin on the flight-deck floor between the
   seats, +X right, +Y up, −Z forward.
   ═══════════════════════════════════════════════════════════ */

import * as THREE from '../../vendor/three.module.min.js';
import { clamp, lerp, damp, deg, pad } from './core.js';
import { audio } from './audio.js';
import { DETENTS } from './sim.js';

const PANEL_GREY = '#3a3f45';
const PANEL_DARK = '#24282d';

/* ── silkscreen ──────────────────────────────────────────── */

function panelCanvas(w, h, fill = PANEL_GREY) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = fill;
  x.fillRect(0, 0, w, h);
  /* a fine speckle so a large flat panel is not a flat fill */
  for (let i = 0; i < w * h / 90; i++) {
    x.fillStyle = `rgba(${Math.random() > 0.5 ? '255,255,255' : '0,0,0'},0.035)`;
    x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  return { c, x };
}

function tex(c, aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

function legend(x, str, px, py, size = 18, color = '#e6ebf2', align = 'center') {
  x.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
  x.fillStyle = color;
  x.textAlign = align;
  x.textBaseline = 'middle';
  x.fillText(str, px, py);
}

function bezel(x, px, py, w, h, r = 6) {
  x.strokeStyle = '#14171b';
  x.lineWidth = 8;
  x.beginPath();
  x.moveTo(px - w / 2 + r, py - h / 2);
  x.arcTo(px + w / 2, py - h / 2, px + w / 2, py + h / 2, r);
  x.arcTo(px + w / 2, py + h / 2, px - w / 2, py + h / 2, r);
  x.arcTo(px - w / 2, py + h / 2, px - w / 2, py - h / 2, r);
  x.arcTo(px - w / 2, py - h / 2, px + w / 2, py - h / 2, r);
  x.closePath();
  x.stroke();
  x.fillStyle = '#0a0d11';
  x.fill();
}

/* ── control primitives ──────────────────────────────────── */

const MAT = {
  panel: null, dark: null,
  button: new THREE.MeshStandardMaterial({ color: 0x4a5158, roughness: 0.55, metalness: 0.25 }),
  buttonLit: new THREE.MeshStandardMaterial({ color: 0x4a5158, roughness: 0.5, metalness: 0.2, emissive: 0x2fe07a, emissiveIntensity: 0 }),
  knob: new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.42, metalness: 0.55 }),
  lever: new THREE.MeshStandardMaterial({ color: 0x1d2126, roughness: 0.38, metalness: 0.5 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.32, metalness: 0.9 }),
  red: new THREE.MeshStandardMaterial({ color: 0xb32424, roughness: 0.45, emissive: 0x400808 }),
  amber: new THREE.MeshStandardMaterial({ color: 0xc07a12, roughness: 0.45 }),
  glass: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  seat: new THREE.MeshStandardMaterial({ color: 0x1a2334, roughness: 0.92 }),
  shell: new THREE.MeshStandardMaterial({ color: 0x2e343b, roughness: 0.86, side: THREE.DoubleSide })
};

let CTRL_ID = 0;

/* Every interactive object is registered here with the geometry
   that moves and the function that runs. The stage raycasts for
   `userData.ctrl` and calls `press`. */
class Control {
  constructor(mesh, opts) {
    this.id = opts.id || `c${CTRL_ID++}`;
    this.mesh = mesh;
    this.type = opts.type;
    this.label = opts.label || this.id;
    this.hint = opts.hint || '';
    this.onPress = opts.onPress;
    this.onDrag = opts.onDrag;
    this.get = opts.get;
    this.rest = mesh.position.clone();
    this.restRot = mesh.rotation.clone();
    this.travel = opts.travel ?? 0.006;
    this.axis = opts.axis || 'z';
    this.pressT = 0;
    this.value = 0;
    this.shown = 0;
    mesh.userData.ctrl = this;
  }

  press(dir = 1, uv = null) {
    this.pressT = 1;
    audio.click(this.type === 'knob' ? 2.2 : 1.2, this.type === 'switch' ? 0.2 : 0.18);
    if (this.type === 'switch') audio.toggle(dir > 0);
    this.onPress?.(dir, uv);
  }

  update(dt) {
    this.pressT = damp(this.pressT, 0, 9, dt);
    const v = this.get ? this.get() : 0;
    this.shown = damp(this.shown, v, 8, dt);

    switch (this.type) {
      case 'button':
        this.mesh.position.z = this.rest.z + this.pressT * this.travel;
        if (this.mesh.material.emissiveIntensity !== undefined) {
          this.mesh.material.emissiveIntensity = this.shown * 0.9;
        }
        break;
      case 'switch':
        this.mesh.rotation.x = this.restRot.x + (this.shown - 0.5) * 0.85;
        break;
      case 'knob':
        this.mesh.rotation.z = this.restRot.z - this.shown;
        break;
      case 'lever':
        this.mesh.rotation.x = this.restRot.x + this.shown * (this.travel || 0.8);
        break;
      case 'slide':
        this.mesh.position.z = this.rest.z + this.shown * (this.travel || 0.1);
        break;
      default: break;
    }
  }
}

/* ── the deck ────────────────────────────────────────────── */

export function buildCockpit(fm, screens, mcdus) {
  const g = new THREE.Group();
  g.name = 'flightdeck';
  const controls = [];
  const reg = (mesh, opts) => {
    const c = new Control(mesh, opts);
    controls.push(c);
    return c;
  };

  /* ── shell, floor, seats ───────────────────────────────── */
  {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.6), MAT.shell);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0.15);
    g.add(floor);

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.6), MAT.shell);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, 2.16, 0.15);
    g.add(ceil);

    /* side walls, with the side-window opening left out */
    for (const sx of [1, -1]) {
      const back = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.16), MAT.shell);
      back.rotation.y = -sx * Math.PI / 2;
      back.position.set(sx * 1.12, 1.08, 0.90);
      g.add(back);
      const under = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.30), MAT.shell);
      under.rotation.y = -sx * Math.PI / 2;
      under.position.set(sx * 1.12, 0.65, -0.10);
      g.add(under);
      /* no panel above the side window: the eye line is at 1.36 m
         and anything up there is only in the way */
    }
    const rear = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.16), MAT.shell);
    rear.position.set(0, 1.08, 1.45);
    g.add(rear);

    for (const sx of [-1, 1]) {
      const seat = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.12, 0.52), MAT.seat);
      base.position.y = 0.46;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.13), MAT.seat);
      back.position.set(0, 0.86, 0.26);
      back.rotation.x = -0.12;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.11), MAT.seat);
      head.position.set(0, 1.30, 0.30);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.42, 10), MAT.metal);
      post.position.y = 0.22;
      seat.add(base, back, head, post);
      seat.position.set(sx * 0.46, 0, 0.60);
      seat.traverse((o) => { o.castShadow = true; });
      g.add(seat);
    }
  }

  /* ── main instrument panel ─────────────────────────────── */

  const MP_W = 1.62, MP_H = 0.58;
  {
    const { c, x } = panelCanvas(2048, 740, PANEL_DARK);
    const U = (fx) => fx * 2048, V = (fy) => fy * 740;

    /* six display cut-outs */
    const slots = [
      [0.115, 0.42, 0.175, 0.60],   /* CAPT PFD */
      [0.305, 0.42, 0.175, 0.60],   /* CAPT ND  */
      [0.500, 0.28, 0.150, 0.40],   /* UPPER ECAM */
      [0.500, 0.72, 0.150, 0.40],   /* LOWER ECAM */
      [0.695, 0.42, 0.175, 0.60],   /* F/O ND */
      [0.885, 0.42, 0.175, 0.60]    /* F/O PFD */
    ];
    for (const [fx, fy, fw, fh] of slots) bezel(x, U(fx), V(fy), U(fw), V(fh), 10);

    legend(x, 'PFD', U(0.115), V(0.80), 26, '#9aa5b2');
    legend(x, 'ND', U(0.305), V(0.80), 26, '#9aa5b2');
    legend(x, 'E/WD', U(0.500), V(0.055), 24, '#9aa5b2');
    legend(x, 'SD', U(0.500), V(0.955), 24, '#9aa5b2');
    legend(x, 'ND', U(0.695), V(0.80), 26, '#9aa5b2');
    legend(x, 'PFD', U(0.885), V(0.80), 26, '#9aa5b2');

    /* gear panel, autobrake, and the landing-gear placard */
    legend(x, 'L/G', U(0.500), V(0.895), 26, '#e6ebf2');
    legend(x, 'AUTO BRK', U(0.052), V(0.115), 22, '#e6ebf2');
    for (const [i, s] of ['LO', 'MED', 'MAX'].entries()) {
      legend(x, s, U(0.024 + i * 0.028), V(0.23), 19, '#cfd7e0');
    }
    legend(x, 'MASTER', U(0.052), V(0.62), 20, '#ff5757');
    legend(x, 'WARN', U(0.052), V(0.67), 20, '#ff5757');
    legend(x, 'MASTER', U(0.948), V(0.62), 20, '#ffb020');
    legend(x, 'CAUT', U(0.948), V(0.67), 20, '#ffb020');
    legend(x, 'ND RANGE', U(0.948), V(0.115), 22, '#e6ebf2');
    for (const [i, s] of ['10', '20', '40', '80'].entries()) {
      legend(x, s, U(0.905 + i * 0.028), V(0.23), 19, '#cfd7e0');
    }
    legend(x, 'CHRONO', U(0.948), V(0.86), 20, '#cfd7e0');

    const mapMain = tex(c);
    MAT.panel = new THREE.MeshStandardMaterial({ map: mapMain, roughness: 0.74, metalness: 0.10, emissiveMap: mapMain, emissive: 0xffffff, emissiveIntensity: 0.20 });
    const panel = new THREE.Mesh(new THREE.BoxGeometry(MP_W, MP_H, 0.10), MAT.panel);
    panel.position.set(0, 1.00, -0.98);
    panel.rotation.x = 0.22;
    panel.receiveShadow = true;
    g.add(panel);
    g.userData.panel = panel;

    /* the screens themselves, mounted just proud of the panel */
    const place = (obj, fx, fy, fw, fh) => {
      const w = fw * MP_W * 0.985, h = fh * MP_H * 0.965;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: obj.t, toneMapped: false }));
      m.position.set((fx - 0.5) * MP_W, (0.5 - fy) * MP_H, 0.052);
      panel.add(m);
      return m;
    };
    place(screens.pfdL, 0.115, 0.42, 0.175, 0.60);
    place(screens.ndL, 0.305, 0.42, 0.175, 0.60);
    place(screens.ewd, 0.500, 0.28, 0.150, 0.40);
    place(screens.sd, 0.500, 0.72, 0.150, 0.40);
    place(screens.ndR, 0.695, 0.42, 0.175, 0.60);
    place(screens.pfdR, 0.885, 0.42, 0.175, 0.60);

    /* — gear lever — */
    const gearHousing = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.03), MAT.knob);
    gearHousing.position.set(0, -0.20, 0.055);
    panel.add(gearHousing);
    const gearLever = new THREE.Group();
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.115, 8), MAT.metal);
    stalk.position.y = 0.058;
    const gknob = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 10), MAT.knob);
    gknob.position.y = 0.118;
    gearLever.add(stalk, gknob);
    gearLever.position.set(0, -0.26, 0.075);
    panel.add(gearLever);
    reg(gearLever, {
      id: 'gear', type: 'lever', label: 'LANDING GEAR',
      hint: 'Raise and lower the landing gear',
      travel: 0.62,
      get: () => 1 - fm.gearTarget,
      onPress: () => fm.toggleGear()
    });

    /* — autobrake — */
    ['LO', 'MED', 'MAX'].forEach((s, i) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.030, 0.014), MAT.buttonLit.clone());
      b.position.set((0.024 + i * 0.028 - 0.5) * MP_W, (0.5 - 0.175) * MP_H, 0.055);
      panel.add(b);
      reg(b, {
        id: 'autobrk' + s, type: 'button', label: `AUTOBRAKE ${s}`,
        hint: 'Set the automatic braking level for landing',
        get: () => (fm.autobrake === i + 1 ? 1 : 0),
        onPress: () => {
          fm.autobrake = fm.autobrake === i + 1 ? 0 : i + 1;
          fm.note(`AUTO BRK ${fm.autobrake ? s : 'OFF'}`);
        }
      });
    });

    /* — ND range — */
    [10, 20, 40, 80].forEach((r, i) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.030, 0.014), MAT.buttonLit.clone());
      b.position.set((0.905 + i * 0.028 - 0.5) * MP_W, (0.5 - 0.175) * MP_H, 0.055);
      panel.add(b);
      reg(b, {
        id: 'ndr' + r, type: 'button', label: `ND RANGE ${r} NM`,
        hint: 'Change the navigation display range',
        get: () => (screens.ndL.range === r ? 1 : 0),
        onPress: () => { screens.ndL.range = screens.ndR.range = r; }
      });
    });

    /* — master warning and caution — */
    for (const [sx, id, mat, label] of [[-1, 'mwarn', MAT.red, 'MASTER WARNING'], [1, 'mcaut', MAT.amber, 'MASTER CAUTION']]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.016), mat.clone());
      b.position.set(sx * MP_W * 0.448, (0.5 - 0.645) * MP_H, 0.056);
      panel.add(b);
      reg(b, {
        id, type: 'button', label,
        hint: 'Acknowledge and clear the alert',
        onPress: () => { fm.events.length = 0; fm.note('ALERT ACKNOWLEDGED'); audio.chime('warn'); }
      });
    }

    /* — chrono — */
    const chr = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.030, 0.014), MAT.buttonLit.clone());
    chr.position.set(MP_W * 0.448, (0.5 - 0.83) * MP_H, 0.056);
    panel.add(chr);
    reg(chr, {
      id: 'chrono', type: 'button', label: 'CHRONO',
      hint: 'Start and stop the elapsed-time counter',
      get: () => (fm.chronoRunning ? 1 : 0),
      onPress: () => {
        fm.chronoRunning = !fm.chronoRunning;
        if (fm.chronoRunning) fm.chronoStart = fm.elapsed;
        fm.note(fm.chronoRunning ? 'CHRONO RUNNING' : 'CHRONO STOP');
      }
    });
  }

  /* ── glareshield: the FCU ──────────────────────────────── */

  const fcuScreen = (() => {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 128;
    return { c, x: c.getContext('2d'), t: null };
  })();
  fcuScreen.t = tex(fcuScreen.c, 4);

  {
    const { c, x } = panelCanvas(1400, 260, PANEL_DARK);
    for (const [i, s] of ['SPD/MACH', 'HDG/TRK', 'ALT', 'V/S'].entries()) {
      legend(x, s, 180 + i * 300, 34, 22, '#cfd7e0');
      bezel(x, 180 + i * 300, 96, 210, 74, 6);
    }
    for (const [i, s] of ['LOC', 'AP1', 'AP2', 'A/THR', 'EXPED', 'APPR'].entries()) {
      legend(x, s, 130 + i * 230, 210, 22, '#cfd7e0');
    }
    const mapFcu = tex(c);
    const fcuMat = new THREE.MeshStandardMaterial({ map: mapFcu, roughness: 0.72, metalness: 0.10, emissiveMap: mapFcu, emissive: 0xffffff, emissiveIntensity: 0.20 });
    const fcu = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.21, 0.13), fcuMat);
    fcu.position.set(0, 1.40, -0.83);
    fcu.rotation.x = 0.60;
    g.add(fcu);

    /* the live windows sit on top of the silkscreen */
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.10, 0.066),
      new THREE.MeshBasicMaterial({ map: fcuScreen.t, toneMapped: false }));
    win.position.set(0, 0.012, 0.072);
    fcu.add(win);
    g.userData.fcuScreen = fcuScreen;

    /* four knobs, one per window */
    const knobDefs = [
      ['spd', 'SPEED', () => fm.ap.spd, (d) => { fm.ap.spd = clamp(fm.ap.spd + d * 5, 100, 350); }],
      ['hdg', 'HEADING', () => fm.ap.hdg, (d) => { fm.ap.hdg = (fm.ap.hdg + d * 5 + 360) % 360; }],
      ['alt', 'ALTITUDE', () => fm.ap.alt, (d) => { fm.ap.alt = clamp(fm.ap.alt + d * 500, 0, 43000); }],
      ['vs', 'VERTICAL SPEED', () => fm.ap.vs || 0, (d) => { fm.ap.vs = clamp((fm.ap.vs || 0) + d * 100, -6000, 6000); }]
    ];
    knobDefs.forEach(([id, label, get, step], i) => {
      const k = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.034, 0.030, 18), MAT.knob);
      body.rotation.x = Math.PI / 2;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.062, 0.016), MAT.metal);
      k.add(body, grip);
      k.position.set((i - 1.5) * 0.256, -0.048, 0.080);
      fcu.add(k);
      reg(k, {
        id: 'fcu-' + id, type: 'knob', label,
        hint: 'Turn to set — drag left and right, or click either side',
        get: () => (get() / 360) % (Math.PI * 2),
        onPress: (dir) => { step(dir); audio.detent(); },
        onDrag: (dx) => { step(Math.sign(dx)); }
      });
    });

    /* six FCU buttons */
    const btns = [
      ['loc', 'LOC', () => fm.ap.loc, () => { fm.ap.loc = !fm.ap.loc; fm.note(fm.ap.loc ? 'LOC ARMED' : 'LOC OFF'); }],
      ['ap1', 'AP 1', () => fm.ap.on, () => fm.toggleAP()],
      ['ap2', 'AP 2', () => fm.ap.on2, () => { fm.ap.on2 = !fm.ap.on2; fm.note(fm.ap.on2 ? 'AP2 ENGAGED' : 'AP2 OFF'); }],
      ['athr', 'A/THR', () => fm.ap.athr, () => { fm.ap.athr = !fm.ap.athr; fm.note(fm.ap.athr ? 'A/THR ACTIVE' : 'A/THR OFF'); }],
      ['exped', 'EXPEDITE', () => fm.ap.exped, () => { fm.ap.exped = !fm.ap.exped; fm.note(fm.ap.exped ? 'EXPEDITE' : ''); }],
      ['appr', 'APPROACH', () => fm.ap.appr, () => {
        fm.ap.appr = !fm.ap.appr;
        if (fm.ap.appr) { fm.ap.alt = 0; fm.ap.spd = Math.round(fm.vRefKt); fm.note('APPR — LAND'); }
      }]
    ];
    btns.forEach(([id, label, get, act], i) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.038, 0.020), MAT.buttonLit.clone());
      b.position.set((i - 2.5) * 0.190, -0.078, 0.068);
      fcu.add(b);
      reg(b, {
        id: 'fcu-' + id, type: 'button', label,
        hint: 'Press to arm or engage',
        get: () => (get() ? 1 : 0),
        onPress: () => { act(); audio.chime(get() ? 'ok' : 'off'); }
      });
    });
  }

  /* ── pedestal ──────────────────────────────────────────── */

  {
    const { c, x } = panelCanvas(1024, 1400, PANEL_DARK);
    legend(x, 'THRUST', 512, 60, 30, '#e6ebf2');
    for (const [i, s] of ['TOGA', 'FLX/MCT', 'CL', 'IDLE', 'REV'].entries()) {
      legend(x, s, 210, 130 + i * 78, 22, '#cfd7e0', 'right');
    }
    legend(x, 'SPD BRK', 820, 130, 24, '#e6ebf2');
    legend(x, 'FLAPS', 820, 470, 26, '#e6ebf2');
    for (const [i, s] of ['0', '1', '2', '3', 'FULL'].entries()) {
      legend(x, s, 900, 540 + i * 74, 24, '#cfd7e0');
    }
    legend(x, 'ENG MASTER', 512, 690, 26, '#e6ebf2');
    legend(x, '1', 400, 740, 24, '#cfd7e0');
    legend(x, '2', 624, 740, 24, '#cfd7e0');
    legend(x, 'ENG MODE', 512, 880, 24, '#e6ebf2');
    legend(x, 'CRANK   NORM   IGN', 512, 920, 20, '#cfd7e0');
    legend(x, 'PARK BRK', 180, 690, 24, '#ffb020');
    legend(x, 'RUDDER TRIM', 180, 880, 22, '#cfd7e0');
    legend(x, 'MCDU', 512, 1010, 24, '#9aa5b2');
    bezel(x, 512, 1200, 470, 330, 8);

    const mapPed = tex(c);
    const pedMat = new THREE.MeshStandardMaterial({ map: mapPed, roughness: 0.72, metalness: 0.10, emissiveMap: mapPed, emissive: 0xffffff, emissiveIntensity: 0.20 });
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.02, 0.98), pedMat);
    ped.position.set(0, 0.70, -0.02);
    ped.rotation.x = -0.30;
    g.add(ped);
    g.userData.pedestal = ped;

    /* — thrust levers — */
    for (const [i, sx] of [-1, 1].entries()) {
      const lever = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.019, 0.20), MAT.lever);
      arm.position.z = -0.09;
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.030, 0.075, 12), MAT.lever);
      grip.rotation.x = 1.1;
      grip.position.set(0, 0.035, -0.175);
      lever.add(arm, grip);
      lever.position.set(sx * 0.052, 0.028, -0.30);
      ped.add(lever);
      reg(lever, {
        id: 'thrust' + (i + 1), type: 'lever', label: `THRUST LEVER ${i + 1}`,
        hint: 'Drag forward for thrust, back for idle and reverse',
        travel: -0.85,
        get: () => fm.throttle,
        onPress: (dir) => fm.setThrottle(fm.throttle + dir * 0.12),
        onDrag: (dx, dy) => fm.setThrottle(fm.throttle - dy * 0.008)
      });
    }

    /* — speedbrake — */
    {
      const sb = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.014, 0.13), MAT.lever);
      arm.position.z = -0.055;
      const grip = new THREE.Mesh(new THREE.SphereGeometry(0.020, 12, 10), MAT.lever);
      grip.position.z = -0.115;
      sb.add(arm, grip);
      sb.position.set(0.155, 0.024, -0.30);
      ped.add(sb);
      reg(sb, {
        id: 'speedbrake', type: 'lever', label: 'SPEED BRAKE',
        hint: 'Deploy the spoilers to slow down or descend',
        travel: -0.75,
        get: () => fm.spoilerTarget,
        onPress: () => {
          fm.spoilerTarget = fm.spoilerTarget > 0.5 ? 0 : 1;
          fm.note(fm.spoilerTarget ? 'SPEED BRAKE OUT' : 'SPEED BRAKE IN');
          audio.servo(1.4, 260, 900);
        }
      });
    }

    /* — flap lever, five detents in a slot — */
    {
      const fl = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.015, 0.10), MAT.lever);
      arm.position.z = -0.04;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.030, 0.048), MAT.lever);
      grip.position.z = -0.095;
      fl.add(arm, grip);
      fl.position.set(0.155, 0.024, 0.14);
      ped.add(fl);
      reg(fl, {
        id: 'flaps', type: 'slide', label: 'FLAP LEVER',
        hint: 'Five positions: 0 · 1 · 2 · 3 · FULL',
        travel: 0.185,
        get: () => fm.detent / 4,
        onPress: (dir) => {
          if (fm.setFlapDetent(fm.detent + (dir > 0 ? 1 : -1))) audio.servo(2.6, 240, 880);
        },
        onDrag: (dx, dy) => {
          const want = clamp(Math.round((fm.detent / 4 + dy * 0.006) * 4), 0, 4);
          if (want !== fm.detent) { if (fm.setFlapDetent(want)) audio.servo(2.6, 240, 880); }
        }
      });
    }

    /* — engine masters — */
    for (const i of [1, 2]) {
      const sw = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.052, 0.020), MAT.knob);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.014, 0.026), MAT.metal);
      tip.position.set(0, 0.022, 0.010);
      sw.add(body, tip);
      sw.position.set((i === 1 ? -0.052 : 0.052), 0.024, 0.235);
      sw.rotation.x = -0.30;
      ped.add(sw);
      reg(sw, {
        id: 'engmaster' + i, type: 'switch', label: `ENGINE ${i} MASTER`,
        hint: 'Start and shut down the engine',
        get: () => (fm.systems['eng' + i] ? 1 : 0),
        onPress: () => {
          const k = 'eng' + i;
          const on = !fm.systems[k];
          if (on && !fm.powered) { fm.note('NO ELECTRICAL POWER'); return; }
          fm.systems[k] = on;
          fm.note(`ENG ${i} ${on ? 'START' : 'SHUT DOWN'}`);
          if (on) audio.servo(6, 60, 380);
        }
      });
    }

    /* — engine mode selector — */
    {
      const k = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.030, 0.024, 16), MAT.knob);
      body.rotation.x = Math.PI / 2;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.052, 0.014), MAT.metal);
      k.add(body, grip);
      k.position.set(0, 0.026, 0.335);
      k.rotation.x = -0.30;
      ped.add(k);
      reg(k, {
        id: 'engmode', type: 'knob', label: 'ENGINE MODE',
        hint: 'CRANK · NORM · IGN START',
        get: () => ((fm.engMode || 1) - 1) * 0.9,
        onPress: (dir) => {
          fm.engMode = clamp((fm.engMode || 1) + dir, 0, 2);
          fm.note(['CRANK', 'NORM', 'IGN/START'][fm.engMode]);
        }
      });
    }

    /* — park brake — */
    {
      const pb = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.022, 14), MAT.red);
      body.rotation.x = Math.PI / 2;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.046, 0.013), MAT.metal);
      pb.add(body, grip);
      pb.position.set(-0.155, 0.026, 0.235);
      pb.rotation.x = -0.30;
      ped.add(pb);
      reg(pb, {
        id: 'parkbrake', type: 'knob', label: 'PARKING BRAKE',
        hint: 'Set and release the parking brake',
        get: () => (fm.parkBrake ? 1.4 : 0),
        onPress: () => { fm.toggleBrake(); audio.thud(0.2); }
      });
    }

    /* — rudder trim — */
    {
      const rt = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.022, 0.018, 12), MAT.knob);
      body.rotation.x = Math.PI / 2;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.038, 0.011), MAT.metal);
      rt.add(body, grip);
      rt.position.set(-0.155, 0.024, 0.335);
      rt.rotation.x = -0.30;
      ped.add(rt);
      reg(rt, {
        id: 'ruddertrim', type: 'knob', label: 'RUDDER TRIM',
        hint: 'Trim out an asymmetry',
        get: () => (fm.rudderTrim || 0) * 3,
        onPress: (dir) => {
          fm.rudderTrim = clamp((fm.rudderTrim || 0) + dir * 0.1, -1, 1);
          fm.note(`RUD TRIM ${(fm.rudderTrim * 20).toFixed(1)}°`);
        }
      });
    }

    /* — the two MCDUs: one mesh each, keys picked by UV — */
    mcdus.forEach((unit, i) => {
      const face = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.02, 0.30), MAT.knob);
      face.add(body);

      const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.165, 0.115),
        new THREE.MeshBasicMaterial({ map: unit.t, toneMapped: false }));
      disp.rotation.x = -Math.PI / 2;
      disp.position.set(0, 0.011, -0.085);
      face.add(disp);

      const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.155),
        new THREE.MeshStandardMaterial({ map: keypadTexture(), roughness: 0.6 }));
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(0, 0.011, 0.068);
      face.add(pad);

      /* line-select keys down each side of the screen */
      const lsk = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.135),
        new THREE.MeshBasicMaterial({ visible: false }));
      lsk.rotation.x = -Math.PI / 2;
      lsk.position.set(0, 0.012, -0.085);
      face.add(lsk);

      face.position.set(i === 0 ? -0.105 : 0.105, 0.022, 0.55);
      face.rotation.x = -0.30;
      ped.add(face);

      reg(pad, {
        id: `mcdu${i}-pad`, type: 'flat', label: 'MCDU KEYPAD',
        hint: 'Type a value, then press a line key',
        onPress: (_d, uv) => { if (uv) unit.key(keyAt(uv)); }
      });
      reg(lsk, {
        id: `mcdu${i}-lsk`, type: 'flat', label: 'LINE SELECT KEY',
        hint: 'Move the scratchpad into the field beside it',
        onPress: (_d, uv) => {
          if (!uv) return;
          const row = clamp(Math.floor((1 - uv.y) * 7), 0, 6);
          if (row === 0) return;
          unit.key((uv.x < 0.5 ? 'L' : 'R') + row);
        }
      });
    });
  }

  /* ── overhead panel ────────────────────────────────────── */

  const OVERHEAD = [
    ['battery', 'BAT 1', 0.10, 0.10], ['extPower', 'EXT PWR', 0.24, 0.10],
    ['apu', 'APU MASTER', 0.42, 0.10], ['apuBleed', 'APU BLEED', 0.60, 0.10],
    ['packs', 'PACK 1+2', 0.78, 0.10],
    ['beacon', 'BEACON', 0.10, 0.34], ['navLights', 'NAV & LOGO', 0.24, 0.34],
    ['strobe', 'STROBE', 0.38, 0.34], ['wingLights', 'WING', 0.52, 0.34],
    ['landingLights', 'LAND L+R', 0.66, 0.34], ['taxiLights', 'NOSE T/O', 0.80, 0.34],
    ['seatbelts', 'SEAT BELTS', 0.10, 0.58], ['noSmoking', 'NO SMOKING', 0.26, 0.58],
    ['emerExit', 'EMER EXIT LT', 0.42, 0.58], ['wipers', 'WIPERS', 0.58, 0.58],
    ['probeHeat', 'PROBE HEAT', 0.74, 0.58],
    ['antiIceWing', 'WING ANTI ICE', 0.14, 0.82], ['antiIce1', 'ENG 1 A/ICE', 0.34, 0.82],
    ['antiIce2', 'ENG 2 A/ICE', 0.54, 0.82], ['apuStart', 'APU START', 0.76, 0.82]
  ];

  {
    const { c, x } = panelCanvas(1400, 900, PANEL_DARK);
    for (const [, label, fx, fy] of OVERHEAD) {
      legend(x, label, fx * 1400, fy * 900 - 46, 21, '#dfe6ee');
      bezel(x, fx * 1400, fy * 900 + 6, 96, 62, 5);
    }
    legend(x, 'ELECTRICAL   ·   AIR', 700, 22, 24, '#8b97a6');
    legend(x, 'EXTERIOR LIGHTS', 700, 258, 24, '#8b97a6');
    legend(x, 'SIGNS  ·  CABIN', 700, 474, 24, '#8b97a6');
    legend(x, 'ANTI ICE  ·  APU', 700, 690, 24, '#8b97a6');

    const mapOv = tex(c);
    const ovMat = new THREE.MeshStandardMaterial({ map: mapOv, roughness: 0.74, metalness: 0.10, emissiveMap: mapOv, emissive: 0xffffff, emissiveIntensity: 0.20 });
    const ov = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.86, 0.06), ovMat);
    ov.position.set(0, 1.97, 0.16);
    ov.rotation.x = Math.PI / 2 - 0.24;
    g.add(ov);
    g.userData.overhead = ov;

    for (const [key, label, fx, fy] of OVERHEAD) {
      const sw = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.042, 0.016), MAT.buttonLit.clone());
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.016, 0.020), MAT.metal);
      tip.position.set(0, -0.014, 0.014);
      sw.add(body, tip);
      sw.position.set((fx - 0.5) * 1.34, (0.5 - fy) * 0.86 - 0.005, 0.036);
      ov.add(sw);
      reg(sw, {
        id: 'ov-' + key, type: 'switch', label,
        hint: 'Switch the system on or off',
        get: () => (fm.systems[key] ? 1 : 0),
        onPress: () => {
          if (key === 'apuStart') {
            if (!fm.systems.apu) { fm.note('APU MASTER OFF'); return; }
            audio.servo(7, 70, 460);
            fm.note('APU STARTING');
            return;
          }
          fm.systems[key] = !fm.systems[key];
          fm.note(`${label} ${fm.systems[key] ? 'ON' : 'OFF'}`);
          if (key === 'landingLights' || key === 'taxiLights') fm.lightsChanged = true;
        }
      });
    }
  }

  /* ── sidesticks and pedals ─────────────────────────────── */

  const sticks = [];
  for (const sx of [-1, 1]) {
    const stick = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.021, 0.20, 10), MAT.lever);
    shaft.position.y = 0.10;
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.075, 4, 12), MAT.lever);
    grip.position.y = 0.235;
    grip.rotation.x = -0.18;
    stick.add(shaft, grip);
    stick.position.set(sx * 0.72, 0.72, 0.42);
    g.add(stick);
    sticks.push(stick);
    if (sx < 0) {
      reg(grip, {
        id: 'sidestick', type: 'flat', label: 'SIDESTICK',
        hint: 'Drag to fly — or use W A S D',
        onDrag: (dx, dy) => {
          fm.stick.roll = clamp(fm.stick.roll + dx * 0.006, -1, 1);
          fm.stick.pitch = clamp(fm.stick.pitch - dy * 0.006, -1, 1);
        }
      });
    }
  }

  for (const sx of [-1, 1]) {
    for (const px of [-0.10, 0.10]) {
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.16, 0.035), MAT.lever);
      pedal.position.set(sx * 0.46 + px, 0.20, -0.54);
      pedal.rotation.x = 0.55;
      g.add(pedal);
    }
  }

  /* ── windows ───────────────────────────────────────────── */

  /* The frames are geometry; the openings are simply not filled,
     so what you see through them is the world the aircraft is
     actually flying over. */
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x4c535b, roughness: 0.68, metalness: 0.25 });
  const frame = (w, h, d, px, py, pz, ry = 0, rx = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameMat);
    m.position.set(px, py, pz);
    m.rotation.set(rx, ry, 0);
    g.add(m);
    return m;
  };
  frame(2.10, 0.045, 0.09, 0, 2.00, -1.22);          /* top rail */
  frame(2.10, 0.060, 0.09, 0, 1.46, -1.26, 0, 0.18); /* bottom rail */
  frame(0.042, 0.58, 0.09, 0, 1.73, -1.24);          /* centre post */
  for (const sx of [-1, 1]) {
    frame(0.048, 0.60, 0.09, sx * 0.70, 1.73, -1.20, sx * 0.26);
    frame(0.044, 0.58, 0.08, sx * 1.06, 1.66, -0.56, sx * 1.10);
    frame(0.044, 0.52, 0.08, sx * 1.12, 1.60, 0.18, sx * 1.42);
  }

  /* ── lighting ──────────────────────────────────────────
     The deck sits inside a shadow-casting fuselage, so almost no
     sunlight reaches it. Real flight decks are lit by their own
     dome and flood lights, and this is that: a cool bounce from
     the windscreen, a warm dome overhead, and a soft flood on
     the panel so the legends can actually be read. */
  {
    /* Broad, soft and boring, because a flight deck is. Point
       lights were tried first and are the wrong tool: they put a
       hot spot on the glareshield and left the panel legends
       unreadable two feet away. */
    g.add(new THREE.HemisphereLight(0xcfe4ff, 0x252b33, 2.6));

    /* daylight coming in over the glareshield */
    const day = new THREE.DirectionalLight(0xe8f2ff, 1.5);
    day.position.set(0.3, 2.2, -4);
    day.target.position.set(0, 1.0, 0);
    g.add(day, day.target);

    /* and a dim warm wash from the dome light, well spread */
    const dome = new THREE.PointLight(0xffe0b8, 5.5, 9, 1.4);
    dome.position.set(0, 2.05, 0.55);
    g.add(dome);
  }

  /* ── build result ──────────────────────────────────────── */

  const api = {
    group: g,
    controls,
    sticks,
    eye: new THREE.Vector3(-0.46, 1.32, 0.44),
    views: {
      pilot: { pos: [-0.40, 1.36, 0.50], look: [-0.30, 1.36, -3.6], fov: 56 },
      mcdu: { pos: [-0.13, 1.10, 0.36], look: [-0.10, 0.60, 0.44], fov: 40 },
      overhead: { pos: [-0.34, 1.34, 0.50], look: [-0.06, 2.04, 0.18], fov: 64 },
      pedestal: { pos: [-0.16, 1.20, 0.40], look: [0.00, 0.62, -0.06], fov: 60 }
    },

    update(dt) {
      for (const c of controls) c.update(dt);
      /* the sidestick shows what the aircraft was told to do */
      sticks[0].rotation.z = -fm.stick.roll * 0.28;
      sticks[0].rotation.x = -fm.stick.pitch * 0.24;
      sticks[1].rotation.z = -fm.stick.roll * 0.28;
      sticks[1].rotation.x = -fm.stick.pitch * 0.24;
      drawFCU(fcuScreen, fm);
    }
  };
  return api;
}

/* ── FCU windows ─────────────────────────────────────────── */

function drawFCU(sc, fm) {
  const { c, x } = sc;
  x.fillStyle = '#05080c';
  x.fillRect(0, 0, c.width, c.height);
  const vals = [
    [String(Math.round(fm.ap.spd)).padStart(3, '0'), 'SPD'],
    [pad(fm.ap.hdg, 3), 'HDG'],
    [String(Math.round(fm.ap.alt)).padStart(5, '0'), 'ALT'],
    [fm.ap.vs ? (fm.ap.vs > 0 ? '+' : '-') + pad(Math.abs(fm.ap.vs) / 100, 2) + '00' : '-----', 'V/S']
  ];
  vals.forEach(([v], i) => {
    x.font = '700 64px ui-monospace, monospace';
    x.fillStyle = fm.ap.on ? '#2fe07a' : '#ffb020';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(v, 128 + i * 256, 64);
  });
  sc.t.needsUpdate = true;
}

/* ── MCDU keypad ─────────────────────────────────────────── */

/* One texture, one mesh, seventy keys. The layout below is both
   the picture and the hit map: `keyAt` reads the same grid. */
const KEYPAD = [
  ['DIR', 'PROG', 'PERF', 'INIT', 'DATA'],
  ['FPLN', 'RADNAV', 'FUEL', 'SEC', 'ATC'],
  ['MENU', 'AIRPORT', 'UP', 'DOWN', 'CLR'],
  ['A', 'B', 'C', 'D', 'E'],
  ['F', 'G', 'H', 'I', 'J'],
  ['K', 'L', 'M', 'N', 'O'],
  ['P', 'Q', 'R', 'S', 'T'],
  ['U', 'V', 'W', 'X', 'Y'],
  ['Z', '/', 'SP', 'OVFY', '+/-'],
  ['1', '2', '3', '4', '5'],
  ['6', '7', '8', '9', '0']
];

let KEYPAD_TEX = null;
function keypadTexture() {
  if (KEYPAD_TEX) return KEYPAD_TEX;
  const W = 760, H = 620;
  const { c, x } = panelCanvas(W, H, '#1c2026');
  const cw = W / 5, ch = H / KEYPAD.length;
  KEYPAD.forEach((row, r) => {
    row.forEach((k, i) => {
      const px = i * cw + cw / 2, py = r * ch + ch / 2;
      x.fillStyle = r < 3 ? '#2f353d' : '#3a4149';
      x.strokeStyle = '#12151a';
      x.lineWidth = 3;
      const w = cw * 0.82, h = ch * 0.76;
      x.beginPath();
      x.roundRect(px - w / 2, py - h / 2, w, h, 6);
      x.fill(); x.stroke();
      legend(x, k === 'UP' ? '▲' : k === 'DOWN' ? '▼' : k,
        px, py, k.length > 4 ? 17 : k.length > 2 ? 20 : 26,
        r < 3 ? '#8fd8ff' : '#e6ebf2');
    });
  });
  KEYPAD_TEX = tex(c);
  return KEYPAD_TEX;
}

function keyAt(uv) {
  const col = clamp(Math.floor(uv.x * 5), 0, 4);
  const row = clamp(Math.floor((1 - uv.y) * KEYPAD.length), 0, KEYPAD.length - 1);
  return KEYPAD[row][col];
}

export { Control, MAT, panelCanvas, legend, bezel, tex };
