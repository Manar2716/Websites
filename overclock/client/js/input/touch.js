/* Touch controls.
 *
 * The design rules this follows, in order of how much they matter:
 *
 * 1. The stick is floating, not fixed. Your thumb lands where it lands and
 *    the stick appears under it; a fixed stick means every sprint starts
 *    with looking down at the screen to find it.
 * 2. Look is the whole screen minus the buttons, not a right-hand box. A
 *    box means flicks die at its edge.
 * 3. Nothing is where the manufacturer put the notch. Positions are in
 *    percentages of the safe area, and every one is movable and resizable,
 *    because thumb reach varies more between people than between phones.
 * 4. Buttons are DOM elements. The browser is better at hit-testing than
 *    hand-rolled maths, and it means the layout editor is just CSS.
 */

import { BTN, InputState } from './input.js';
import { clamp } from '../../../shared/math.js';

const RAD_PER_PX = 0.0042;
/* The smallest a control may render at, whatever the viewport. This is the
   figure both Apple and Android publish for a reliable touch target. */
const MIN_TOUCH_PX = 44;

/* Percentages of the safe area. Nothing sits between 40% and 64% across:
   that band is where the crosshair and whatever you are shooting at live,
   and a button there is a button your own thumb hides the fight behind. */
export const DEFAULT_LAYOUT = {
  fire: { x: 85, y: 68, size: 15 },
  ads: { x: 69, y: 81, size: 11 },
  jump: { x: 93, y: 45, size: 11 },
  crouch: { x: 79, y: 39, size: 11 },
  reload: { x: 67, y: 61, size: 11 },
  swap: { x: 67, y: 35, size: 11 },
  sprint: { x: 19, y: 33, size: 11 },
  scores: { x: 50, y: 93, size: 9 },
  /* Without this a player on a phone can start a match and then have no
     way out of it short of reloading the page. It sits clear of the
     minimap and the score line, and out of thumb reach on purpose. */
  menu: { x: 30, y: 9, size: 9 },
};

const LABELS = {
  fire: 'FIRE', ads: 'ADS', jump: 'JUMP', crouch: 'CRCH',
  reload: 'RLD', swap: 'SWAP', sprint: 'RUN', scores: 'TAB', menu: 'MENU',
};

export class TouchControls {
  constructor(root, state, settings) {
    this.root = root;
    this.state = state || new InputState();
    this.settings = settings;
    this.layout = { ...DEFAULT_LAYOUT };
    this.enabled = false;
    this.editing = false;
    this.buttons = new Map();
    this.stick = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
    this.look = { id: -1, lastX: 0, lastY: 0, movedAt: 0, startX: 0, startY: 0, moved: 0 };
    this.adsHeld = false;
    this.sprintLatched = false;
    this.onMenu = null;
    this.onEditChange = null;
    this._build();
    this._bind();
  }

  setLayout(l) {
    this.layout = { ...DEFAULT_LAYOUT, ...(l || {}) };
    this.applyLayout();
  }

  applyLayout() {
    for (const [action, el] of this.buttons) {
      const c = this.layout[action] || DEFAULT_LAYOUT[action];
      el.style.left = c.x + '%';
      el.style.top = c.y + '%';
      /* Sized in vmin so the layout scales with the screen, but never
         below MIN_TOUCH_PX. A phone in landscape has a short axis of
         around 390 px, where 8 vmin is a 31 px target — small enough that
         a thumb misses it, which is a bug however good the layout looks. */
      const size = `max(${MIN_TOUCH_PX}px, ${c.size}vmin)`;
      el.style.width = size;
      el.style.height = size;
      el.style.fontSize = `max(9px, ${(c.size * 0.26).toFixed(2)}vmin)`;
    }
    this.root.style.setProperty('--touch-opacity', String(this.settings.buttonOpacity ?? 0.55));
  }

  _build() {
    this.root.innerHTML = '';
    this.root.classList.add('touch');

    this.lookLayer = div('touch__look');
    this.root.appendChild(this.lookLayer);

    this.stickEl = div('touch__stick');
    this.stickKnob = div('touch__knob');
    this.stickEl.appendChild(this.stickKnob);
    this.root.appendChild(this.stickEl);

    for (const action of Object.keys(DEFAULT_LAYOUT)) {
      const el = div('touch__btn touch__btn--' + action);
      el.dataset.action = action;
      el.textContent = LABELS[action] || action.toUpperCase();
      this.root.appendChild(el);
      this.buttons.set(action, el);
    }
    this.applyLayout();
  }

  _bind() {
    const r = this.root;

    r.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      const btn = e.target.closest && e.target.closest('.touch__btn');
      if (this.editing) {
        if (btn) this._beginDrag(e, btn);
        e.preventDefault();
        return;
      }
      if (btn) { this._press(btn.dataset.action, true, e); e.preventDefault(); return; }

      const rect = r.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / rect.width;
      /* Left of the stick boundary starts the movement stick; anything
         else is a look drag. The boundary follows the layout so a
         left-handed rearrangement still behaves. */
      if (relX < (this.settings.stickZone ?? 0.44) && this.stick.id < 0) {
        this.stick.id = e.pointerId;
        this.stick.active = true;
        this.stick.ox = e.clientX; this.stick.oy = e.clientY;
        this.stick.x = 0; this.stick.y = 0;
        this.stickEl.style.left = (e.clientX - rect.left) + 'px';
        this.stickEl.style.top = (e.clientY - rect.top) + 'px';
        this.stickEl.classList.add('is-active');
        this._moveKnob(0, 0);
      } else if (this.look.id < 0) {
        this.look.id = e.pointerId;
        this.look.lastX = e.clientX; this.look.lastY = e.clientY;
        this.look.startX = e.clientX; this.look.startY = e.clientY;
        this.look.moved = 0;
        this.look.downAt = performance.now();
      }
      r.setPointerCapture && r.setPointerCapture(e.pointerId);
      e.preventDefault();
    }, { passive: false });

    r.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      if (this.editing) { this._drag(e); return; }
      if (e.pointerId === this.stick.id) {
        const dx = e.clientX - this.stick.ox;
        const dy = e.clientY - this.stick.oy;
        const max = this._stickRadius();
        const len = Math.hypot(dx, dy);
        const k = len > max ? max / len : 1;
        this.stick.x = (dx * k) / max;
        this.stick.y = (dy * k) / max;
        this._moveKnob(dx * k, dy * k);
        /* Pushing the stick to its edge is the sprint gesture, so running
           does not need a button — though there is one for people who
           prefer it. */
        if (len > max * 0.92) this.sprintLatched = true;
        else if (len < max * 0.5) this.sprintLatched = false;
      } else if (e.pointerId === this.look.id) {
        const dx = e.clientX - this.look.lastX;
        const dy = e.clientY - this.look.lastY;
        this.look.lastX = e.clientX; this.look.lastY = e.clientY;
        this.look.moved += Math.abs(dx) + Math.abs(dy);
        const s = this.settings;
        const base = s.touchSensitivity * (this.adsHeld ? s.adsSensitivity : 1);
        // Negated: dragging right is a yaw decrease. See InputState.lookDX.
        this.state.lookDX += -dx * RAD_PER_PX * base * s.sensitivityX * (s.invertX ? -1 : 1);
        this.state.lookDY += -dy * RAD_PER_PX * base * s.sensitivityY * (s.invertY ? -1 : 1);
      }
      e.preventDefault();
    }, { passive: false });

    const end = (e) => {
      if (this.editing) { this._endDrag(); return; }
      if (e.pointerId === this.stick.id) {
        this.stick.id = -1; this.stick.active = false;
        this.stick.x = this.stick.y = 0;
        this.sprintLatched = false;
        this.stickEl.classList.remove('is-active');
        this._moveKnob(0, 0);
      }
      if (e.pointerId === this.look.id) {
        /* A tap that did not travel is a shot, if the player has asked for
           tap-to-fire. It is off by default because it fights ADS. */
        if (this.settings.tapToFire && this.look.moved < 12 && performance.now() - this.look.downAt < 260) {
          this._tapFire = performance.now();
        }
        this.look.id = -1;
      }
      const btn = e.target.closest && e.target.closest('.touch__btn');
      if (btn) this._press(btn.dataset.action, false, e);
      else this._releaseAll(e.pointerId);
    };
    r.addEventListener('pointerup', end);
    r.addEventListener('pointercancel', end);
    r.addEventListener('lostpointercapture', end);
    r.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _stickRadius() {
    return Math.min(window.innerWidth, window.innerHeight) * 0.085;
  }

  _moveKnob(dx, dy) {
    this.stickKnob.style.transform = `translate(-50%,-50%) translate(${dx}px, ${dy}px)`;
  }

  _press(action, down, e) {
    const el = this.buttons.get(action);
    if (el) el.classList.toggle('is-down', down);
    const s = this.state;
    switch (action) {
      case 'fire': s.set(BTN.FIRE, down); if (down) this._fireId = e.pointerId; break;
      case 'ads':
        if (this.settings.adsMode === 'toggle') { if (down) { this.adsHeld = !this.adsHeld; s.set(BTN.ADS, this.adsHeld); } }
        else { this.adsHeld = down; s.set(BTN.ADS, down); }
        break;
      case 'jump': s.set(BTN.JUMP, down); break;
      case 'crouch':
        if (this.settings.crouchMode === 'toggle') { if (down) { this.crouchLatched = !this.crouchLatched; s.set(BTN.CROUCH, this.crouchLatched); } }
        else s.set(BTN.CROUCH, down);
        break;
      case 'reload': s.set(BTN.RELOAD, down); break;
      case 'swap': if (down) s.pendingSwap = true; break;
      case 'sprint':
        if (down) { this.sprintButton = !this.sprintButton; }
        break;
      case 'scores': s.scoreboard = down; break;
      case 'menu': if (down && this.onMenu) this.onMenu(); break;
      default: break;
    }
    if (down && navigator.vibrate && this.settings.haptics) navigator.vibrate(action === 'fire' ? 8 : 12);
  }

  _releaseAll(pointerId) {
    // A pointer lifted off a button it did not start on still releases it.
    if (this._fireId === pointerId) { this.state.set(BTN.FIRE, false); this._fireId = -1; }
  }

  /* ── Layout editing ────────────────────────────────────────────── */
  setEditing(on) {
    this.editing = on;
    this.root.classList.toggle('is-editing', on);
    this.state.reset();
    for (const el of this.buttons.values()) el.classList.remove('is-down');
    if (this.onEditChange) this.onEditChange(on);
  }

  _beginDrag(e, btn) {
    const rect = this.root.getBoundingClientRect();
    this._drag_ = {
      action: btn.dataset.action, id: e.pointerId, rect,
      dx: e.clientX - (rect.left + rect.width * this.layout[btn.dataset.action].x / 100),
      dy: e.clientY - (rect.top + rect.height * this.layout[btn.dataset.action].y / 100),
    };
    btn.classList.add('is-dragging');
  }

  _drag(e) {
    const d = this._drag_;
    if (!d || e.pointerId !== d.id) return;
    const x = clamp(((e.clientX - d.dx - d.rect.left) / d.rect.width) * 100, 4, 96);
    const y = clamp(((e.clientY - d.dy - d.rect.top) / d.rect.height) * 100, 4, 96);
    this.layout[d.action] = { ...this.layout[d.action], x: +x.toFixed(1), y: +y.toFixed(1) };
    this.applyLayout();
  }

  _endDrag() {
    if (this._drag_) {
      const el = this.buttons.get(this._drag_.action);
      if (el) el.classList.remove('is-dragging');
    }
    this._drag_ = null;
  }

  resize(action, size) {
    if (!this.layout[action]) return;
    this.layout[action] = { ...this.layout[action], size: clamp(size, 6, 26) };
    this.applyLayout();
  }

  resetLayout() { this.layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT)); this.applyLayout(); }

  /* ── Poll ──────────────────────────────────────────────────────── */
  poll() {
    const s = this.state;
    if (!this.enabled) { s.moveX = 0; s.moveZ = 0; return s; }
    const dead = this.settings.stickDeadzone ?? 0.12;
    let x = this.stick.x, y = -this.stick.y;
    const len = Math.hypot(x, y);
    if (len < dead) { x = 0; y = 0; }
    else {
      // Rescale past the dead zone so the first responsive position is a
      // slow walk rather than a jump to half speed.
      const k = ((len - dead) / (1 - dead)) / len;
      x *= k; y *= k;
    }
    s.moveX = clamp(x, -1, 1);
    s.moveZ = clamp(y, -1, 1);
    s.set(BTN.SPRINT, this.sprintLatched || !!this.sprintButton);
    if (this._tapFire && performance.now() - this._tapFire < 90) s.set(BTN.FIRE, true);
    else if (this._tapFire) { this._tapFire = 0; if (!this._fireId || this._fireId < 0) s.set(BTN.FIRE, false); }
    s.source = 'touch';
    return s;
  }

  show(on) {
    this.enabled = on;
    this.root.style.display = on ? '' : 'none';
    if (!on) { this.state.reset(); this.stick.id = -1; this.look.id = -1; }
  }
}

function div(cls) { const d = document.createElement('div'); d.className = cls; return d; }

/* Gyroscope aiming. Small relative adjustments layered on top of the
   thumb, which is how it is actually used — nobody turns 180 degrees by
   rotating their phone. */
export class Gyro {
  constructor(state, settings) {
    this.state = state;
    this.settings = settings;
    this.enabled = false;
    this.available = typeof DeviceOrientationEvent !== 'undefined';
    this.last = null;
    this._handler = (e) => this._onOrientation(e);
  }

  async enable() {
    if (!this.available) return false;
    const D = DeviceOrientationEvent;
    if (typeof D.requestPermission === 'function') {
      try {
        const r = await D.requestPermission();
        if (r !== 'granted') return false;
      } catch { return false; }
    }
    window.addEventListener('deviceorientation', this._handler, true);
    this.enabled = true;
    this.last = null;
    return true;
  }

  disable() {
    window.removeEventListener('deviceorientation', this._handler, true);
    this.enabled = false;
    this.last = null;
  }

  _onOrientation(e) {
    if (!this.enabled || e.alpha === null) return;
    const cur = { a: e.alpha, b: e.beta, g: e.gamma };
    if (!this.last) { this.last = cur; return; }
    // In landscape the phone's gamma axis is the one that yaws the view.
    const landscape = Math.abs(window.orientation || 0) === 90 || window.innerWidth > window.innerHeight;
    let dYaw = shortest(this.last.a, cur.a);
    let dPitch = landscape ? -(cur.g - this.last.g) : (cur.b - this.last.b);
    this.last = cur;
    const k = (this.settings.gyroStrength ?? 1) * 0.017;
    if (Math.abs(dYaw) < 25 && Math.abs(dPitch) < 25) {
      this.state.lookDX += -dYaw * k * (this.settings.gyroInvertX ? -1 : 1);
      this.state.lookDY += dPitch * k * (this.settings.gyroInvertY ? 1 : -1);
    }
  }
}

function shortest(a, b) {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}
