/* Numbers that both ends of the wire have to agree on.
   Anything in here is part of the protocol: change it on one side only
   and prediction stops matching the server. */

export const PROTOCOL_VERSION = 3;

/* The simulation runs at a fixed step on both ends. Client prediction
   replays inputs through the exact same integrator, so this constant is
   load-bearing — it is not a "target frame rate". */
export const TICK_HZ = 60;
export const TICK_DT = 1 / TICK_HZ;

/* Snapshots go out less often than the sim runs. Remote players are
   interpolated between them, so this sets the interpolation window. */
export const SNAPSHOT_HZ = 20;
export const SNAPSHOT_DT = 1 / SNAPSHOT_HZ;

/* How far back the server will rewind other players to judge a shot.
   Longer is friendlier to high-ping shooters and worse for the people
   being shot at ("I died behind cover"). 250 ms is the usual compromise. */
export const MAX_REWIND_MS = 250;
export const HISTORY_MS = 1000;

/* Client renders remote players this far in the past so there is always
   a pair of snapshots to interpolate between, even with one dropped. */
export const INTERP_DELAY_MS = 2.2 * (1000 / SNAPSHOT_HZ);

export const MAX_PLAYERS = 16;
export const MAX_BOTS = 12;

/* Player capsule, approximated as an axis-aligned box for collision.
   RADIUS is half-width; the world is built on a 1-unit grid where
   1 unit reads as roughly a metre. */
export const PLAYER_RADIUS = 0.42;
export const PLAYER_HEIGHT = 1.78;
export const PLAYER_CROUCH_HEIGHT = 1.16;
export const EYE_OFFSET = 0.14;          // eye sits this far below the crown
export const STEP_HEIGHT = 0.55;          // walk up stairs and low ledges
export const HEAD_HEIGHT = 0.30;          // top slice counts as a headshot
export const LEG_HEIGHT = 0.62;           // bottom slice counts as legs

/* Movement. Tuned fast and floaty-but-grounded — the arcade end of the
   dial, not the milsim end. */
export const MOVE = {
  walkSpeed: 7.1,
  sprintSpeed: 10.4,
  crouchSpeed: 3.7,
  adsSpeedMul: 0.55,
  /* Acceleration is a coefficient, not a rate: the step taken each tick
     is accel * targetSpeed * dt. A flat rate has to be re-tuned every
     time a speed changes, and if it ever falls below friction * speed the
     player silently never reaches full speed. */
  accelGround: 13,
  accelAir: 2.6,
  frictionGround: 11.5,
  gravity: 28,
  jumpSpeed: 9.2,   // ~1.5 units of clearance: mounts a 1.25 crate with room to spare
  airControl: 0.62,
  maxAirSpeed: 12.5,
  crouchLerp: 11,
  /* Anything faster than this in one tick is not physically reachable and
     the server rejects the position outright. Slack for slope boosts. */
  maxTickSpeed: 15.5,
};

export const RESPAWN_MS = 2600;
export const SPAWN_PROTECT_MS = 1200;

/* Damage-zone multipliers. Applied to the weapon's base damage. */
export const ZONE = { head: 2.05, body: 1.0, leg: 0.82 };

export const TEAM = { NONE: 0, ALPHA: 1, BRAVO: 2 };

export const MSG = {
  /* client -> server */
  HELLO: 1,
  INPUT: 2,
  SPAWN_REQUEST: 3,
  CHAT: 4,
  SWITCH_WEAPON: 5,
  LOBBY_ACTION: 6,
  PING: 7,
  /* server -> client */
  WELCOME: 20,
  SNAPSHOT: 21,
  LOBBY_STATE: 22,
  MATCH_START: 23,
  MATCH_END: 24,
  EVENT: 25,
  PONG: 26,
  ERROR: 27,
  KICK: 28,
  SCORES: 29,      // full scoreboard, broadcast once a second while live
};

/* Server -> client one-shot events, batched into the snapshot stream. */
export const EV = {
  SHOT: 1,          // somebody fired: draw a tracer and play a shot
  HIT: 2,           // you hit somebody: hit marker + damage number
  DAMAGE: 3,        // you took damage: direction indicator + flash
  KILL: 4,          // kill feed entry
  RESPAWN: 5,
  RELOAD: 6,
  PICKUP: 7,
  WEAPON_SWITCH: 8,
  IMPACT: 9,        // a bullet landed on geometry
  JUMP: 10,
  MODE_MESSAGE: 11, // "level up", "last kill", etc.
};

/* Input buttons, packed into one 16-bit field per command. */
export const BTN = {
  JUMP: 1, CROUCH: 2, SPRINT: 4, FIRE: 8, ADS: 16, RELOAD: 32,
  W1: 64, W2: 128, W3: 256, MELEE: 512, SWAP: 1024,
};

export const GAME_STATE = { LOBBY: 0, COUNTDOWN: 1, LIVE: 2, ENDED: 3 };
