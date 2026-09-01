/* Session handling: what a server does with a message from a client.
 *
 * Transport-agnostic on purpose. The dedicated server feeds this from a
 * WebSocket; the browser feeds it from a function call when you play
 * offline against bots. Because it is the same code, "practice" and
 * "online" are not two implementations of the game that can drift apart —
 * they are the same implementation with a different pipe.
 */

import { MSG, PROTOCOL_VERSION } from '../constants.js';
import { encodeJson, decodeJson, decodeInput } from '../protocol.js';
import { RoomManager, sanitiseName } from './rooms.js';
import { MAP_INFO } from '../maps/index.js';
import { MODE_IDS } from '../sim/modes.js';
import { DIFFICULTY_IDS } from '../sim/bots.js';
import { WEAPON_IDS, loadoutWeapons } from '../weapons.js';

export function createSession() {
  return { rooms: new RoomManager(), nextClientId: 1 };
}

export function createClient(session, send, over = {}) {
  const c = {
    id: session.nextClientId++,
    token: over.token || randomToken(),
    name: over.name || 'PLAYER',
    room: null,
    player: null,
    ping: 0,
    loadout: null,
    skin: 0,
    ready: false,
    lastClientTime: 0,
    send,
    fail(reason) { send(encodeJson(MSG.ERROR, { message: reason })); },
  };
  return c;
}

export function randomToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'tok-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function welcomePayload(client) {
  return {
    id: client.id, token: client.token, protocol: PROTOCOL_VERSION,
    name: client.name, serverTime: Date.now(),
    maps: MAP_INFO, modes: MODE_IDS, difficulties: DIFFICULTY_IDS,
  };
}

export function handleBinary(session, client, buf) {
  const msg = decodeInput(buf);
  if (!msg) return;
  client.lastClientTime = msg.clientTime;
  if (!client.room || !client.room.match || !client.player) return;
  client.room.match.queueInput(client.player.id, msg.cmds);
}

export function handleText(session, client, raw) {
  const msg = decodeJson(raw);
  if (!msg) return;
  const d = msg.d || {};
  switch (msg.t) {
    case MSG.HELLO:
      if (msg.v !== PROTOCOL_VERSION) {
        client.fail(`This client speaks protocol ${msg.v}; the server speaks ${PROTOCOL_VERSION}. Reload the page.`);
        return { close: 'protocol mismatch' };
      }
      client.name = sanitiseName(d.name, client.name);
      client.skin = Math.max(0, Math.min(11, d.skin | 0));
      client.loadout = sanitiseLoadout(d.loadout);
      if (typeof d.token === 'string' && d.token.length <= 64) client.token = d.token;
      client.send(encodeJson(MSG.WELCOME, welcomePayload(client)));
      return;

    case MSG.PING:
      client.send(encodeJson(MSG.PONG, { t: d.t, s: Date.now() }));
      return;

    case MSG.PONG: {
      /* The reply to the server's own ping. Ping is measured here rather
         than reported by the client, because it feeds lag compensation and
         a client's claimed ping would be worth lying about. */
      const sent = Number(d.t);
      if (Number.isFinite(sent) && sent > 0 && sent <= Date.now()) {
        const rtt = Date.now() - sent;
        client.ping = Math.round(client.ping * 0.7 + Math.min(1200, rtt) * 0.3);
        if (client.player) client.player.ping = client.ping;
      }
      return;
    }

    case MSG.SWITCH_WEAPON:
      client.loadout = sanitiseLoadout(d);
      if (client.player && client.room && client.room.match && client.room.match.mode.id !== 'gungame') {
        client.player.loadout = client.loadout;
      }
      return;

    case MSG.CHAT: {
      if (!client.room) return;
      const body = String(d.text || '').replace(/[\x00-\x1f\x7f<>&]/g, '').slice(0, 120).trim();
      if (!body) return;
      client.room.broadcastJson(MSG.CHAT, {
        from: client.name, id: client.id, text: body,
        team: client.player ? client.player.team : 0,
      });
      return;
    }

    case MSG.LOBBY_ACTION:
      handleLobby(session, client, d);
      return;

    default:
      return;
  }
}

export function sanitiseLoadout(d) {
  if (!d || typeof d !== 'object') return null;
  const pick = (v, dflt) => (typeof v === 'string' && WEAPON_IDS.includes(v) ? v : dflt);
  const l = { primary: pick(d.primary, 'rift7'), secondary: pick(d.secondary, 'talon') };
  loadoutWeapons(l);
  return l;
}

function handleLobby(session, client, d) {
  const rooms = session.rooms;
  switch (String(d.action || '')) {
    case 'list':
      client.send(encodeJson(MSG.LOBBY_STATE, { list: rooms.list() }));
      return;

    case 'create':
      if (client.room) client.room.remove(client);
      rooms.create(client, d.config || {});
      return;

    case 'join': {
      const room = rooms.get(d.code);
      if (!room) { client.fail('No room with that code.'); return; }
      if (room.full) { client.fail('That room is full.'); return; }
      if (client.room) client.room.remove(client);
      room.add(client);
      return;
    }

    case 'quick':
      if (client.room) client.room.remove(client);
      rooms.quickPlay(client, d.prefs || {});
      return;

    case 'leave':
      if (client.room) client.room.remove(client);
      return;

    case 'ready':
      client.ready = !!d.ready;
      if (client.room) client.room.broadcastLobby();
      return;

    case 'config':
      if (!client.room || client.room.host !== client) { client.fail('Only the host can change the setup.'); return; }
      client.room.setConfig(d.config || {});
      return;

    case 'start':
      if (!client.room) return;
      if (client.room.host !== client) { client.fail('Only the host can start the match.'); return; }
      client.room.start();
      return;

    case 'team': {
      if (!client.room || !client.player) return;
      const t = d.team | 0;
      if (t === 1 || t === 2) { client.player.team = t; client.room.broadcastLobby(); }
      return;
    }

    case 'kick': {
      const room = client.room;
      if (!room || room.host !== client) return;
      const victim = room.clients.find((c) => c.id === (d.id | 0));
      if (victim && victim !== client) { victim.fail('The host removed you from the room.'); room.remove(victim); }
      return;
    }

    default:
      return;
  }
}
