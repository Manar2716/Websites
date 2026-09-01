/* Player models.
 *
 * Nine boxes and a gun. The brief is readability, not anatomy: at forty
 * metres on a phone screen what matters is that a silhouette is instantly
 * a person, instantly which side they are on, and instantly which way they
 * are facing. So the shoulders are wide, the head is a clear cube, and the
 * team colour sits on the chest and head where it survives being small.
 *
 * Models are built facing local -Z, which is the direction the camera
 * faces at yaw 0, so a player's yaw drives the model with no offset.
 */

import { PLAYER_HEIGHT } from '../../../shared/constants.js';
import { parseColour } from '../engine/gl.js';

const SKIN_COLOURS = [
  '#7f8794', '#8a6f5c', '#5f7f6a', '#8a6a86', '#6f7a95', '#94836a',
  '#5d8590', '#8f6f6f', '#79856a', '#6a6f8f', '#8a8060', '#6d8a7c',
];
export const TEAM_COLOURS = { 1: '#3f8fe8', 2: '#f0762f', 0: '#c9cdd4' };

export function avatarColours(team, skin, isBot) {
  const base = parseColour('#3c4149');
  const accentHex = team ? TEAM_COLOURS[team] : SKIN_COLOURS[skin % SKIN_COLOURS.length];
  return {
    base,
    accent: parseColour(accentHex),
    dark: parseColour('#23262b'),
    /* Bots wear an emissive band. The scoreboard and kill feed tag them
       too, but a tag you have to open a menu to read is no use in the
       middle of a fight. */
    mark: isBot ? parseColour('#f5e04a') : null,
    accentHex,
  };
}

/* Advances the per-player animation state. Remote players' velocity comes
   from the interpolation layer rather than from the wire. */
export function stepAnim(a, speed, onGround, dt, crouchFrac) {
  a.phase = (a.phase || 0) + speed * dt * 1.65;
  a.speed = (a.speed || 0) + ((speed) - (a.speed || 0)) * Math.min(1, dt * 12);
  a.air = (a.air || 0) + ((onGround ? 0 : 1) - (a.air || 0)) * Math.min(1, dt * 9);
  a.crouch = crouchFrac;
  a.lean = (a.lean || 0);
  return a;
}

/* Pushes one player into the instance batch. `p` needs x,y,z, yaw, pitch,
   height, team, skin, bot and an anim object. */
export function pushAvatar(batch, p, anim, opts = {}) {
  const c = opts.colours || avatarColours(p.team, p.skin || 0, p.bot);
  const s = p.height / PLAYER_HEIGHT;               // crouching squashes the model
  const y = p.y;
  const yaw = p.yaw;
  const fade = opts.alpha === undefined ? 1 : opts.alpha;

  const stride = Math.min(1, (anim.speed || 0) / 8.5);
  const swing = Math.sin(anim.phase || 0) * 0.62 * stride;
  const swing2 = Math.sin((anim.phase || 0) + Math.PI) * 0.62 * stride;
  const air = anim.air || 0;
  const bob = Math.sin((anim.phase || 0) * 2) * 0.018 * stride;
  const pitch = Math.max(-0.7, Math.min(0.7, p.pitch || 0));

  // Local offsets are rotated into world space by the model's yaw.
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const put = (lx, ly, lz, hx, hy, hz, col, rotYaw, rotPitch, emissive) => {
    const wx = p.x + (lx * cy + lz * sy) * s;
    const wz = p.z + (-lx * sy + lz * cy) * s;
    batch.push(wx, y + ly * s, wz, hx * s, hy * s, hz * s,
      yaw + (rotYaw || 0), rotPitch || 0,
      col[0], col[1], col[2], emissive || 0, fade);
  };

  const legPitch = (v) => v * (1 - air) + air * 0.5;
  // Legs. Pitched about the hip, so the box centre swings forward of the joint.
  const hipY = 0.86 + bob;
  for (const [side, sw] of [[-1, swing], [1, swing2]]) {
    const a = legPitch(sw);
    const ly = hipY - 0.44 * Math.cos(a);
    const lz = 0.44 * Math.sin(a);
    put(side * 0.135, ly, lz, 0.085, 0.44, 0.10, c.dark, 0, -a);
  }
  // Boots, so the legs do not end in a flat plane.
  for (const [side, sw] of [[-1, swing], [1, swing2]]) {
    const a = legPitch(sw);
    put(side * 0.135, hipY - 0.86 * Math.cos(a) + 0.05, 0.86 * Math.sin(a) - 0.03, 0.095, 0.06, 0.15, c.dark, 0, -a * 0.3);
  }

  put(0, hipY + 0.06, 0, 0.21, 0.13, 0.13, c.dark);                        // hips
  put(0, hipY + 0.40, 0, 0.235, 0.27, 0.145, c.base, 0, pitch * 0.22);     // torso
  put(0, hipY + 0.46, -0.09, 0.15, 0.16, 0.06, c.accent, 0, pitch * 0.22); // chest plate
  put(0, hipY + 0.63, 0, 0.24, 0.05, 0.15, c.base);                        // shoulders

  // Arms hold the weapon, so they follow the aim pitch.
  const armPitch = -pitch * 0.85 - 0.95;
  for (const side of [-1, 1]) {
    const ax = side * 0.275;
    const ay = hipY + 0.56 + Math.sin(armPitch) * 0.20;
    const az = -Math.cos(armPitch) * 0.20;
    put(ax, ay - 0.12, az, 0.072, 0.20, 0.078, c.base, 0, armPitch + Math.PI / 2);
  }

  // Head, with the team colour wrapped round it.
  const headY = hipY + 0.79;
  put(0, headY, 0, 0.125, 0.125, 0.125, c.base, 0, pitch * 0.6);
  put(0, headY + 0.02, -0.10, 0.10, 0.045, 0.045, c.accent, 0, pitch * 0.6);
  if (c.mark) put(0, headY + 0.145, 0, 0.075, 0.028, 0.075, c.mark, 0, 0, 0.9);

  // The weapon, held out in front at the aim angle.
  const gunY = hipY + 0.50 - Math.sin(pitch) * 0.30;
  const gunZ = -0.40 * Math.cos(pitch);
  put(0.02, gunY + Math.sin(pitch) * 0.1, gunZ, 0.045, 0.05, 0.24, c.dark, 0, pitch);
  put(0.02, gunY - 0.09 + Math.sin(pitch) * 0.1, gunZ + 0.12, 0.035, 0.06, 0.05, c.dark, 0, pitch);
}

/* A soft dark quad under each player. It is not a shadow map, but the
   thing a shadow actually does at this scale — telling you whether
   somebody is standing on your floor or a balcony above it — is exactly
   what a blob under the feet does, for almost nothing. */
export function pushBlobShadow(batch, x, groundY, z, radius, strength) {
  batch.push(x, groundY + 0.012, z, radius, 0.006, radius, 0, 0, 0, 0, 0, 0, strength);
}
