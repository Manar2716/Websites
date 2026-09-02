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
    /* Keys pressed since the last poll. Input is sampled once a frame, so
       without this a jump tapped between two frames is silently lost —
       which is worst exactly when the frame rate is worst. */
    this.tapped = new Set();
    this.locked = false;
    this.enabled = false;
    /* Pointer lock is not always available — an iframe without the
       pointer-lock permission refuses it, and so do some kiosk and
       privacy modes. Rather than leaving the player unable to look, the
       game falls back to raw mousemove deltas without the lock. The
       cursor stays visible and can leave the window, which is worse, but
       it is the difference between playable and not. */
    this.lockDenied = false;
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
    for (const k of keys) if (this.down.has(k) || this.tapped.has(k)) return true;
    return false;
  }

  /* True only on the poll that follows the key going down. Used for the
     things that must fire once per press however long it is held. */
  wasTapped(action) {
    const keys = this.bindings[action];
    if (!keys) return false;
    for (const k of keys) if (this.tapped.has(k)) return true;
    return false;
  }

  requestLock() {
    if (this.locked) return;
    const el = this.canvas;
    if (!el.requestPointerLock) { this.lockDenied = true; return; }
    /* `unadjustedMovement` asks for genuinely raw input. Where it is
       unsupported the promise rejects and the plain call still gets
       OS-accelerated deltas, which is better than nothing. */
    let p;
    try { p = el.requestPointerLock({ unadjustedMovement: true }); } catch { p = null; }
    if (p && p.catch) {
      p.catch(() => {
        try {
          const q = el.requestPointerLock();
          if (q && q.catch) q.catch(() => { this.lockDenied = true; });
        } catch { this.lockDenied = true; }
      });
    } else if (!p) {
      try { el.requestPointerLock(); } catch { this.lockDenied = true; }
    }
    /* Nothing rejected, but nothing locked either: some embedders simply
       ignore the request. Give it a moment, then fall back. */
    setTimeout(() => { if (!this.locked) this.lockDenied = true; }, 700);
  }

  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  _bind() {
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.down.clear(); this.state.reset(); }
      if (this.onLockChange) this.onLockChange(this.locked);
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || !this.active) return;
      const s = this.settings;
      const base = s.sensitivity * (this._ads ? s.adsSensitivity : 1);
      // Negated: mouse-right is a yaw decrease. See InputState.lookDX.
      this.state.lookDX += -e.movementX * RAD_PER_COUNT * base * s.sensitivityX * (s.invertX ? -1 : 1);
      this.state.lookDY += -e.movementY * RAD_PER_COUNT * base * s.sensitivityY * (s.invertY ? -1 : 1);
    }, { passive: true });

    window.addEventListener('mousedown', (e) => {
      if (!this.enabled || !this.active) return;
      e.preventDefault();
      if (e.button === 0) this.state.set(BTN.FIRE, true);
      if (e.button === 2) this._setAds(true);
      if (e.button === 1) this.state.pendingSwap = true;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.state.set(BTN.FIRE, false);
      if (e.button === 2) this._setAds(false);
    });

    window.addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });

    window.addEventListener('wheel', (e) => {
      if (!this.enabled || !this.active) return;
      this.state.wheel += Math.sign(e.deltaY);
    }, { passive: true });

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const code = e.code;
      if (this.isBound(code)) e.preventDefault();
      this.down.add(code);
      this.tapped.add(code);
      if (!this.enabled) return;
      if (this.matches('menu', code) && this.onMenu) this.onMenu();
      if (this.matches('chat', code) && this.onChat) this.onChat();
    });

    window.addEventListener('keyup', (e) => { this.down.delete(e.code); });
    window.addEventListener('blur', () => { this.down.clear(); this.tapped.clear(); this.state.reset(); });
  }

  /* Playable right now: either the pointer is locked, or we know the lock
     is unavailable and are reading unlocked deltas instead. */
  get active() { return this.locked || this.lockDenied; }

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
    if (!this.enabled || !this.active) { s.moveX = 0; s.moveZ = 0; s.buttons &= BTN.ADS; this.tapped.clear(); return s; }
    s.moveZ = (this.isDown('forward') ? 1 : 0) - (this.isDown('back') ? 1 : 0);
    s.moveX = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    s.set(BTN.JUMP, this.isDown('jump'));
    s.set(BTN.CROUCH, this.isDown('crouch'));
    s.set(BTN.SPRINT, this.isDown('sprint'));
    s.set(BTN.RELOAD, this.isDown('reload'));
    s.set(BTN.W1, this.isDown('weapon1'));
    s.set(BTN.W2, this.isDown('weapon2'));
    s.set(BTN.W3, this.isDown('weapon3'));
    /* Edge-triggered: holding the swap key used to cycle the whole loadout
       over and over, one weapon every 320 ms. */
    if (this.wasTapped('swap')) s.pendingSwap = true;
    s.scoreboard = this.isDown('scoreboard');
    s.source = 'keyboard';
    this.tapped.clear();
    return s;
  }
}
