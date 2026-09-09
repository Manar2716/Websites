/* ═══════════════════════════════════════════════════════════
   sim.js — a simplified flight model.

   This is a point-mass model with real aerodynamic *shape*: lift
   and drag come from a coefficient curve, thrust falls off with
   density, and the aircraft is trimmed by pitch attitude rather
   than by being told where to go. It behaves the way an airliner
   behaves — it needs speed before it will fly, it sinks when you
   pull too hard, it floats if you cross the threshold fast — and
   that is the point of it.

   It is not, and does not claim to be, a professional or
   certified flight simulator. Anything the real aircraft does
   that is not visible from the flight deck window has been left
   out on purpose.

   Units are SI inside and converted at the edges: metres,
   metres per second, radians, newtons, kilograms.
   ═══════════════════════════════════════════════════════════ */

import { clamp, lerp, damp, deg, rad2deg } from './core.js';
import { groundHeight } from './scenery.js';

const G = 9.80665;
const KT = 0.514444;                       /* knots → m/s */
const FT = 0.3048;

/* ISA: the only place altitude turns into physics. */
export function atmosphere(h) {
  const T = 288.15 - 0.0065 * Math.min(h, 11000);
  const p = h < 11000
    ? 101325 * Math.pow(T / 288.15, 5.2559)
    : 22632 * Math.exp(-G * (h - 11000) / (287.053 * 216.65));
  const rho = p / (287.053 * (h < 11000 ? T : 216.65));
  const a = Math.sqrt(1.4 * 287.053 * (h < 11000 ? T : 216.65));
  return { T, p, rho, a, sigma: rho / 1.225 };
}

/* Flap detents, Airbus style. Each carries the lift it adds, the
   drag it costs, and the placard speed it must be below. */
const DETENTS = [
  { name: '0', slat: 0, flap: 0, dCL: 0.00, dCD: 0.0000, vfe: 999 },
  { name: '1', slat: 1, flap: 0.18, dCL: 0.32, dCD: 0.0075, vfe: 230 },
  { name: '2', slat: 1, flap: 0.45, dCL: 0.62, dCD: 0.0180, vfe: 200 },
  { name: '3', slat: 1, flap: 0.72, dCL: 0.86, dCD: 0.0320, vfe: 185 },
  { name: 'FULL', slat: 1, flap: 1.00, dCL: 1.08, dCD: 0.0520, vfe: 177 }
];

export const PHASES = [
  'COLD & DARK', 'POWERED', 'ENGINES RUNNING', 'TAXI', 'TAKEOFF',
  'CLIMB', 'CRUISE', 'DESCENT', 'APPROACH', 'LANDED'
];

export class FlightModel {
  constructor(type) {
    this.setType(type);
    this.reset();
  }

  setType(type) {
    this.type = type;
    const s = type.spec;
    this.mass = s.mtow * 0.80;                       /* a normal operating weight */
    this.emptyMass = s.mtow * 0.55;
    /* Wing area is not published in fleet.js, so it is estimated
       from span and mean chord — which the geometry does define.
       The 0.56 is the factor that puts the A320 on its published
       122.6 m²; the rest of the fleet then lands within a few per
       cent of theirs, which is close enough for speeds that are
       shown to two significant figures. */
    const meanChord = (type.geo.rootChord * 0.72 + type.geo.tipChord) * s.length;
    this.S = s.span * meanChord * 0.56;
    this.engines = type.geo.engines;
    const lbf = parseFloat(String(s.thrust).replace(/[^\d]/g, '')) || 27000;
    this.maxThrust = lbf * 4.44822 * this.engines;   /* lbf → N, all engines */
    this.vRef = Math.sqrt((2 * this.mass * G) / (1.225 * this.S * 2.25)) / KT;
  }

  reset(opts = {}) {
    /* Lined up on runway 09, a couple of hundred metres past the
       threshold, cold and dark. psi is measured so that 0 points
       along +X, which is runway heading 090. */
    this.x = opts.x ?? 200;
    this.z = opts.z ?? 0;
    this.alt = opts.alt ?? 0;                        /* metres AMSL */
    this.V = opts.V ?? 0;                            /* TAS, m/s */
    this.gamma = 0;
    this.psi = opts.psi ?? 0;
    this.theta = 0;                                  /* pitch */
    this.phi = 0;                                    /* roll */
    this.p = 0; this.q = 0; this.r = 0;              /* body rates */

    this.stick = { pitch: 0, roll: 0, yaw: 0 };
    this.throttle = 0;
    this.n1 = 0;
    this.reverse = 0;
    this.gear = 1;
    this.gearTarget = 1;
    this.detent = 0;
    this.flap = 0; this.slat = 0;
    this.spoiler = 0; this.spoilerTarget = 0;
    this.parkBrake = true;
    this.brakes = 0;
    this.autobrake = 0;

    this.systems = {
      battery: false, apu: false, apuBleed: false, extPower: false,
      eng1: false, eng2: false, packs: false,
      beacon: false, navLights: false, strobe: false, landingLights: false,
      seatbelts: false, noSmoking: true, wipers: false
    };

    this.ap = { on: false, hdg: 270, alt: 10000, spd: 250, athr: false, mode: 'MANUAL' };
    this.phase = 0;
    this.onGround = true;
    this.gLoad = 1;
    this.touchdownVS = 0;
    this.lastVS = 0;
    this.events = [];
    this.wheelSpin = 0;
    this.compression = 0;
    this.turbulence = 0;
    this.elapsed = 0;
  }

  get detents() { return DETENTS; }
  get detentName() { return DETENTS[this.detent].name; }

  /* ── derived readouts ──────────────────────────────────── */
  get atm() { return atmosphere(this.alt); }
  get ias() { return (this.V * Math.sqrt(this.atm.sigma)) / KT; }
  get tas() { return this.V / KT; }
  get mach() { return this.V / this.atm.a; }
  get altFt() { return this.alt / FT; }
  get vsFpm() { return (this.V * Math.sin(this.gamma)) / FT * 60; }
  get hdgDeg() { return (450 - this.psi * rad2deg) % 360; }
  get alpha() { return this.theta - this.gamma; }
  get groundAlt() { return groundHeight(this.x, this.z); }
  get radioAlt() { return (this.alt - this.groundAlt) / FT; }
  get vRefKt() {
    const d = DETENTS[this.detent];
    const clMax = 1.35 + d.dCL;
    return Math.sqrt((2 * this.mass * G) / (1.225 * this.S * clMax)) / KT * 1.23;
  }
  get v1Kt() { return this.vRefKt * 1.06; }
  get vrKt() { return this.vRefKt * 1.10; }
  get v2Kt() { return this.vRefKt * 1.16; }

  /* Stall speed as a true airspeed, at the current weight,
     configuration and density. The envelope protections below
     are all expressed against it. */
  get vStall() {
    const clMax = 1.35 + DETENTS[this.detent].dCL;
    return Math.sqrt((2 * this.mass * G) / (this.atm.rho * this.S * clMax));
  }

  get running() { return this.systems.eng1 && this.systems.eng2; }
  get powered() { return this.systems.battery && (this.systems.apu || this.systems.extPower || this.running); }

  /* ── control inputs ────────────────────────────────────── */

  setThrottle(v) { this.throttle = clamp(v, 0, 1); }
  setFlapDetent(i) {
    const n = clamp(i, 0, DETENTS.length - 1);
    if (n === this.detent) return false;
    if (n > this.detent && this.ias > DETENTS[n].vfe) {
      this.note('FLAP SPEED — REDUCE'); return false;
    }
    this.detent = n;
    this.note(`FLAPS ${DETENTS[n].name}`);
    return true;
  }
  toggleGear() {
    if (this.gearTarget > 0.5 && this.onGround) { this.note('GEAR — ON GROUND'); return false; }
    if (this.gearTarget < 0.5 && this.ias > 250) { this.note('GEAR SPEED — REDUCE'); return false; }
    this.gearTarget = this.gearTarget > 0.5 ? 0 : 1;
    this.note(this.gearTarget > 0.5 ? 'GEAR DOWN' : 'GEAR UP');
    return true;
  }
  toggleBrake() {
    this.parkBrake = !this.parkBrake;
    this.note(this.parkBrake ? 'PARK BRAKE SET' : 'PARK BRAKE RELEASED');
  }
  toggleAP() {
    if (this.onGround) { this.note('AUTOPILOT — AIRBORNE ONLY'); return false; }
    this.ap.on = !this.ap.on;
    this.ap.athr = this.ap.on;
    this.note(this.ap.on ? 'AP1 ENGAGED' : 'AP OFF');
    return true;
  }

  note(msg) {
    this.events.unshift({ msg, t: this.elapsed });
    if (this.events.length > 6) this.events.pop();
  }

  /* One button that takes the aircraft from cold to ready to
     roll, because nobody should have to find eleven switches
     before they can see the runway move. */
  quickStart() {
    const s = this.systems;
    s.battery = s.apu = s.apuBleed = s.packs = true;
    s.eng1 = s.eng2 = true;
    s.beacon = s.navLights = s.strobe = true;
    this.n1 = 0.22;
    this.detent = 1;
    this.parkBrake = false;
    this.phase = 3;
    this.note('READY FOR DEPARTURE');
  }

  /* ── integration ───────────────────────────────────────── */

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.elapsed += dt;

    const d = DETENTS[this.detent];
    this.flap = damp(this.flap, d.flap, 0.9, dt);
    this.slat = damp(this.slat, d.slat, 1.3, dt);
    this.gear = damp(this.gear, this.gearTarget, 0.55, dt);
    this.spoiler = damp(this.spoiler, this.spoilerTarget, 3.5, dt);

    /* engines: N1 lags the lever, and lags harder from idle,
       which is the whole reason a jet is flown ahead of itself */
    const demand = this.running ? lerp(0.21, 1.0, this.throttle) : (this.systems.apu ? 0.0 : 0);
    const spool = this.n1 < demand ? (this.n1 < 0.4 ? 0.35 : 0.75) : 0.9;
    this.n1 = damp(this.n1, demand, spool, dt);
    this.reverse = damp(this.reverse, this.revTarget || 0, 1.8, dt);

    const atm = this.atm;
    const qBar = 0.5 * atm.rho * this.V * this.V;

    /* ── autoflight ────────────────────────────────────── */
    if (this.ap.on) this._autopilot(dt);

    /* ── attitude: rate commands, with envelope limits ──── */
    const authority = clamp(this.V / 80, 0.15, 1);
    let pitchRate = this.stick.pitch * 0.55 * authority;
    const rollRate = this.stick.roll * 1.35 * authority;

    /* Envelope protection, in the spirit of the real thing: the
       aircraft will not let itself be pulled into a stall. Nose-up
       authority is faded out as the speed approaches 1.13 Vs, and
       angle of attack is hard-limited. This is the one behaviour
       from the A320 that most defines how it feels to fly, so it
       is here even in a simplified model. */
    const vs = this.vStall;
    if (!this.onGround && pitchRate > 0) {
      const margin = clamp((this.V / (vs * 1.13) - 0.97) / 0.10, 0, 1);
      pitchRate *= margin;
      if (margin < 0.35 && !this._alphaWarned) {
        this._alphaWarned = true;
        this.note('ALPHA PROT');
      } else if (margin > 0.8) this._alphaWarned = false;
    }
    const alphaMax = 16 * deg;

    if (this.onGround && this.V < this.vrKt * KT * 0.92) {
      /* the nose stays down until the wing will hold it up */
      this.theta = damp(this.theta, 0, 6, dt);
      this.phi = damp(this.phi, 0, 6, dt);
    } else {
      this.theta = clamp(this.theta + pitchRate * dt, -18 * deg,
                         Math.min(30 * deg, this.gamma + alphaMax));
      this.phi = clamp(this.phi + rollRate * dt, -67 * deg, 67 * deg);
      /* hands off, an Airbus holds the attitude it was given */
      if (Math.abs(this.stick.roll) < 0.02 && !this.ap.on) {
        if (Math.abs(this.phi) < 33 * deg) this.phi = damp(this.phi, 0, 0.55, dt);
      }
      /* Alpha floor: below 1.05 Vs the aircraft stops taking the
         instruction and puts its own nose down until the speed is
         back. This is the protection doing something visible
         rather than only refusing an input, and it is why you
         cannot stall this aircraft by holding the stick back. */
      if (this.V < vs * 1.05) {
        this.theta = damp(this.theta, this.gamma - 2 * deg, 1.6, dt);
        if (!this._floorWarned) { this._floorWarned = true; this.note('ALPHA FLOOR'); }
      } else if (this.V > vs * 1.20) this._floorWarned = false;
    }

    /* ── forces ───────────────────────────────────────── */
    const alpha = clamp(this.theta - this.gamma, -12 * deg, 22 * deg);
    const CL = clamp(0.22 + 5.1 * alpha + d.dCL - this.spoiler * 0.42, -0.6, 2.6);
    const CD = 0.0205 + 0.045 * CL * CL + d.dCD
             + this.gear * 0.0185 + this.spoiler * 0.055
             + Math.max(0, this.mach - 0.80) * 0.34;

    const L = qBar * this.S * CL;
    const D = qBar * this.S * CD;
    const T = this.n1 * this.n1 * this.maxThrust * clamp(atm.sigma, 0.18, 1)
            * (1 - this.reverse * 1.75);

    if (this.onGround) this._ground(dt, T, D, L);
    else this._air(dt, T, D, L, alpha);

    /* ── ground contact ───────────────────────────────── */
    this.airborne = this.onGround ? 0 : (this.airborne || 0) + dt;

    const gAlt = this.groundAlt;
    const wheelH = this.type.spec.height * 0.30 * this.gear;
    const floor = gAlt + wheelH;
    /* A touchdown needs half a second in the air first, so a
       rotation is never mistaken for one. */
    if (!this.onGround && this.airborne > 0.5 && this.alt <= floor) {
      this.touchdownVS = this.vsFpm;
      this.alt = floor;
      this.onGround = true;
      this.gamma = 0;
      this.compression = clamp(-this.touchdownVS / 700, 0, 1);
      this.note(this.gear > 0.5
        ? `TOUCHDOWN ${Math.abs(Math.round(this.touchdownVS))} FT/MIN`
        : 'GEAR UP LANDING');
      /* Ground spoilers, but only for an arrival — a firm bounce
         during a touch-and-go should not dump the lift. */
      if (this.V < this.vRefKt * KT * 1.35) this.spoilerTarget = 1;
      this.phase = 9;
      this.onTouchdown?.(this.touchdownVS);
    } else if (this.onGround && this.alt > floor + 0.4) {
      this.onGround = false;
      if (this.phase === 9) this.phase = 4;
    }
    if (this.onGround) this.alt = floor;
    this.compression = damp(this.compression, this.onGround ? 0.25 : 0, 3, dt);

    /* wheels keep turning after they touch */
    this.wheelSpin += (this.onGround ? this.V : this.V * 0.02) * dt / 0.6;

    /* ── position ─────────────────────────────────────── */
    const ground = this.V * Math.cos(this.gamma);
    this.x += ground * Math.cos(this.psi) * dt;
    this.z -= ground * Math.sin(this.psi) * dt;
    if (!this.onGround) this.alt += this.V * Math.sin(this.gamma) * dt;

    /* ── ride quality ─────────────────────────────────── */
    const shear = clamp(1 - this.alt / 3600, 0, 1);
    this.turbulence = damp(this.turbulence,
      this.onGround ? clamp(this.V / 90, 0, 1) * 0.55 : shear * 0.35 + this.n1 * 0.08, 2, dt);

    this.lastVS = this.vsFpm;
    this._phase();
  }

  _ground(dt, T, D) {
    const rollDrag = (this.parkBrake ? 26000 : 0) + this.brakes * 42000 * (this.mass / 79000)
                   + this.V * 320 + 1400;
    const net = T - D - rollDrag * Math.sign(Math.max(this.V, 0.001));
    this.V = Math.max(0, this.V + (net / this.mass) * dt);
    this.gamma = 0;

    /* nose-wheel steering below 60 kt, rudder above */
    const steer = this.stick.yaw * (this.V < 30 ? 0.45 : 0.12) * clamp(this.V / 6, 0, 1);
    this.psi += steer * dt;

    /* Rotation. The attitude block above has already moved the
       pitch; all this does is ask whether the wing is now
       carrying the weight. The nose is held down until the
       aircraft is near VR, and never rotates past the tailstrike
       angle. */
    if (this.V > this.vrKt * KT * 0.92) {
      this.theta = clamp(this.theta, 0, 13.5 * deg);
      const lift = 0.5 * this.atm.rho * this.V * this.V * this.S *
                   (0.22 + 5.1 * this.theta + this.detents[this.detent].dCL);
      if (lift > this.mass * G) {
        this.onGround = false;
        this.gamma = 0.025;
        /* Off the ground by a hand's width, so that the contact
           test later in this same frame does not immediately
           declare a landing. Without it the aircraft rotates,
           lifts, touches down and deploys its ground spoilers in
           one sixtieth of a second, then slides up the next
           hillside with the altimeter winding up behind it. */
        this.alt += 0.25;
        this.airborne = 0;
        this.note('AIRBORNE');
        this.phase = 4;
      }
    }
  }

  _air(dt, T, D, L, alpha) {
    const m = this.mass;
    const V = Math.max(this.V, 12);

    this.V += ((T * Math.cos(alpha) - D) / m - G * Math.sin(this.gamma)) * dt;
    this.V = Math.max(this.V, 8);

    const lifting = (L * Math.cos(this.phi) + T * Math.sin(alpha) - m * G * Math.cos(this.gamma));
    this.gamma += (lifting / (m * V)) * dt;
    this.gamma = clamp(this.gamma, -25 * deg, 25 * deg);

    /* a banked wing turns; that is the only way an airliner does */
    this.psi += ((L * Math.sin(this.phi)) / (m * V)) * dt;

    /* a little adverse yaw from the pedals, and the sideslip they
       create, so the rudder is not decoration */
    this.psi += this.stick.yaw * 0.09 * dt;

    this.gLoad = damp(this.gLoad, (L * Math.cos(this.phi)) / (m * G) || 1, 6, dt);
  }

  _autopilot(dt) {
    const a = this.ap;

    /* SPD: autothrust drives N1 to hold the target IAS */
    if (a.athr) {
      const err = a.spd - this.ias;
      this.throttle = clamp(this.throttle + err * 0.0022, 0, 1);
    }

    /* HDG: roll to a bank proportional to heading error, capped
       at 25° like the real thing */
    let herr = (a.hdg - this.hdgDeg + 540) % 360 - 180;
    const bank = clamp(-herr * 0.9, -25, 25) * deg;
    this.phi = damp(this.phi, bank, 1.4, dt);

    /* ALT: fly a vertical speed proportional to the altitude
       error, capped, then trim pitch to achieve it */
    const aerr = (a.alt - this.altFt);
    const targetVS = clamp(aerr * 6.5, -2200, 2400);
    const vsErr = (targetVS - this.vsFpm) / 1000;
    this.theta = clamp(damp(this.theta, this.gamma + clamp(vsErr * 0.10, -0.10, 0.14), 1.6, dt),
                       -12 * deg, 20 * deg);

    a.mode = Math.abs(aerr) < 120 ? 'ALT HOLD'
           : aerr > 0 ? 'CLIMB' : 'DESCENT';
  }

  _phase() {
    if (!this.powered) { this.phase = 0; return; }
    if (!this.running) { this.phase = 1; return; }
    if (this.onGround) {
      if (this.phase === 9) return;
      this.phase = this.V > 25 ? 4 : this.V > 1 ? 3 : 2;
      return;
    }
    const vs = this.vsFpm;
    if (this.radioAlt < 1800 && vs < -200) this.phase = 8;
    else if (vs > 350) this.phase = 5;
    else if (vs < -350) this.phase = 7;
    else this.phase = 6;
  }

  get phaseName() { return PHASES[this.phase]; }

  /* Distance and bearing to the runway threshold, for the ND. */
  toRunway() {
    const dx = -this.x, dz = -this.z;
    return {
      dist: Math.hypot(dx, dz) / 1852,
      brg: (450 - Math.atan2(-dz, dx) * rad2deg) % 360
    };
  }
}

export { KT, FT, DETENTS };
