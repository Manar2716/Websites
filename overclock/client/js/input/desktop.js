/* Keyboard and mouse.
 *
 * Look uses `movementX`, which is the browser's raw, unaccelerated
 * pointer delta — the same number the OS gives the compositor before any
 * pointer acceleration curve is applied to the cursor. That is what makes
 * muscle memory transfer between sessions, and it is why there is no
 * smoothing option here: smoothing look input adds latency to the one
 * thing in a shooter that must not have any.
 */

import { BTN, DEFAULT_BINDINGS, InputState } from './input.js';

const RAD_PER_COUNT = 0.0022;          // at sensitivity 1.0

export class DesktopInput {
  constructor(canvas, state, settings) {
    this.canvas = canvas;
    this.state = state || new InputState();
    this.settings = settings;
    this.bindings = { ...DEFAULT_BINDINGS };
    this.down = new Set();
    this.locked = false;
    this.enabled = false;
    this.onMenu = null;
    this.onChat = null;
    this.onLockChange = null;
    this.adsToggleState = false;
    this._bind();
  }

  setBindings(b) { this.bindings = { ...DEFAULT_BINDINGS, ...(b || {}) }; }

  isDown(action) {
    const keys = this.bindings[action];
    if (!keys) return false;
    for (const k of keys) if (this.down.has(k)) return true;
    return false;
  }

  requestLock() {
    if (this.locked) return;
    const el = this.canvas;
    const p = el.requestPointerLock && el.requestPointerLock({ unadjustedMovement: true });
    /* `unadjustedMovement` is the request for genuinely raw input. Where
       it is unsupported the promise rejects and the plain call still gets
       us OS-accelerated deltas, which is better than nothing. */
    if (p && p.catch) p.catch(() => { try { el.requestPointerLock(); } catch {} });
    else if (!p) { try { el.requestPointerLock(); } catch {} }
  }

  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  _bind() {
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.down.clear(); this.state.reset(); }
      if (this.onLockChange) this.onLockChange(this.locked);
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      const s = this.settings;
      const base = s.sensitivity * (this._ads ? s.adsSensitivity : 1);
      this.state.lookDX += e.movementX * RAD_PER_COUNT * base * s.sensitivityX * (s.invertX ? -1 : 1);
      this.state.lookDY += -e.movementY * RAD_PER_COUNT * base * s.sensitivityY * (s.invertY ? -1 : 1);
    }, { passive: true });

    window.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked) return;
      e.preventDefault();
      if (e.button === 0) this.state.set(BTN.FIRE, true);
      if (e.button === 2) this._setAds(true);
      if (e.button === 1) this.state.pendingSwap = true;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.state.set(BTN.FIRE, false);
      if (e.button === 2) this._setAds(false);
    });

    window.addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });

    window.addEventListener('wheel', (e) => {
      if (!this.enabled || !this.locked) return;
      this.state.wheel += Math.sign(e.deltaY);
    }, { passive: true });

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const code = e.code;
      if (this.isBound(code)) e.preventDefault();
      this.down.add(code);
      if (!this.enabled) return;
      if (this.matches('menu', code) && this.onMenu) this.onMenu();
      if (this.matches('chat', code) && this.onChat) this.onChat();
    });

    window.addEventListener('keyup', (e) => { this.down.delete(e.code); });
    window.addEventListener('blur', () => { this.down.clear(); this.state.reset(); });
  }

  isBound(code) {
    for (const k in this.bindings) if (this.bindings[k].includes(code)) return true;
    return false;
  }
  matches(action, code) { return (this.bindings[action] || []).includes(code); }

  _setAds(on) {
    if (this.settings.adsMode === 'toggle') {
      if (on) { this.adsToggleState = !this.adsToggleState; this._ads = this.adsToggleState; }
    } else {
      this._ads = on;
    }
    this.state.set(BTN.ADS, this._ads);
  }

  /* Called once per simulation tick. */
  poll() {
    const s = this.state;
    if (!this.enabled || !this.locked) { s.moveX = 0; s.moveZ = 0; s.buttons &= BTN.ADS; return s; }
    s.moveZ = (this.isDown('forward') ? 1 : 0) - (this.isDown('back') ? 1 : 0);
    s.moveX = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    s.set(BTN.JUMP, this.isDown('jump'));
    s.set(BTN.CROUCH, this.isDown('crouch'));
    s.set(BTN.SPRINT, this.isDown('sprint'));
    s.set(BTN.RELOAD, this.isDown('reload'));
    s.set(BTN.W1, this.isDown('weapon1'));
    s.set(BTN.W2, this.isDown('weapon2'));
    s.set(BTN.W3, this.isDown('weapon3'));
    if (this.isDown('swap')) s.pendingSwap = true;
    s.scoreboard = this.isDown('scoreboard');
    s.source = 'keyboard';
    return s;
  }
}
