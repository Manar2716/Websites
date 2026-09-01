/* The shared input state.
 *
 * Both the keyboard and the touchscreen fill in the same small structure,
 * and the game reads only this. That is what makes "the same game on a
 * phone and a laptop" a real claim rather than two code paths that drift.
 *
 * Look is accumulated as a delta and consumed once per simulation tick, so
 * a 1000 Hz mouse and a 60 Hz touchscreen both end up applying exactly the
 * movement they reported, with nothing dropped between frames.
 */

import { BTN } from '../../../shared/constants.js';
import { clamp } from '../../../shared/math.js';

export const DEFAULT_BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  crouch: ['ControlLeft', 'KeyC'],
  sprint: ['ShiftLeft'],
  reload: ['KeyR'],
  weapon1: ['Digit1'],
  weapon2: ['Digit2'],
  weapon3: ['Digit3'],
  swap: ['KeyQ'],
  scoreboard: ['Tab'],
  chat: ['KeyT'],
  menu: ['Escape'],
};

export class InputState {
  constructor() {
    this.moveX = 0;
    this.moveZ = 0;
    this.buttons = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.lookDX = 0;      // radians accumulated since the last consume
    this.lookDY = 0;
    this.scoreboard = false;
    this.wheel = 0;
    this.pendingSwap = false;
    this.source = 'keyboard';
  }

  set(mask, on) { if (on) this.buttons |= mask; else this.buttons &= ~mask; }
  has(mask) { return (this.buttons & mask) !== 0; }

  /* Applies accumulated look and returns the angles for this tick. */
  consumeLook(maxPitch = Math.PI / 2 - 0.02) {
    this.yaw = wrap(this.yaw + this.lookDX);
    this.pitch = clamp(this.pitch + this.lookDY, -maxPitch, maxPitch);
    this.lookDX = 0;
    this.lookDY = 0;
    return this;
  }

  reset() {
    this.moveX = this.moveZ = 0;
    this.buttons = 0;
    this.lookDX = this.lookDY = 0;
  }
}

export function wrap(a) {
  const t = Math.PI * 2;
  return ((a % t) + t) % t;
}

export { BTN };
