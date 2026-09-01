/* End-to-end test against a real server over a real socket.
 *
 *   node tools/test-server.js
 *
 * This starts the actual server on a spare port and drives it with the
 * WebSocket client built into Node, so the handshake, the framing, the
 * binary protocol, the room logic and the simulation are all exercised
 * the way a browser would exercise them.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MSG, PROTOCOL_VERSION, BTN, GAME_STATE, EV } from '../shared/constants.js';
import { encodeJson, decodeJson, encodeInput, decodeSnapshot, FLAG } from '../shared/protocol.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8817 + (process.pid % 100);
const URL = `ws://127.0.0.1:${PORT}/ws`;

let pass = 0, fail = 0;
const ok = (c, label, detail = '') => {
  if (c) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (detail ? '  — ' + detail : '')); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class TestClient {
  constructor(name) {
    this.name = name;
    this.json = [];
    this.snapshots = [];
    this.events = [];
    this.seq = 1;
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(URL);
      this.ws.binaryType = 'arraybuffer';
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(new Error('ws error ' + (e.message || '')));
      this.ws.onmessage = (e) => {
        if (typeof e.data === 'string') {
          const m = decodeJson(e.data);
          if (!m) return;
          this.json.push(m);
          if (m.t === MSG.WELCOME) { this.id = m.d.id; this.token = m.d.token; }
          if (m.t === MSG.LOBBY_STATE) this.lobby = m.d;
          if (m.t === MSG.MATCH_START) this.matchStart = m.d;
          if (m.t === MSG.MATCH_END) this.matchEnd = m.d;
          if (m.t === MSG.EVENT) this.events.push(...m.d);
          if (m.t === MSG.PING) this.send(MSG.PONG, { t: m.d.t });
        } else {
          const s = decodeSnapshot(new Uint8Array(e.data));
          if (s) this.snapshots.push(s);
        }
      };
    });
  }
  send(t, d) { this.ws.send(encodeJson(t, d)); }
  hello(extra = {}) { this.send(MSG.HELLO, { name: this.name, ...extra }); }
  lobbyAction(d) { this.send(MSG.LOBBY_ACTION, d); }
  input(cmd, count = 3) {
    const cmds = [];
    for (let i = 0; i < count; i++) cmds.push({ seq: this.seq++, moveX: 0, moveZ: 0, buttons: 0, yaw: 0, pitch: 0, ...cmd });
    this.ws.send(encodeInput(cmds, Date.now() & 0xffffffff));
  }
  waitFor(pred, ms = 4000) {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (pred(this)) { clearInterval(iv); resolve(this); }
        else if (Date.now() - t0 > ms) { clearInterval(iv); reject(new Error('timeout waiting')); }
      }, 20);
    });
  }
  close() { try { this.ws.close(); } catch {} }
}

const server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (b) => { serverLog += b; });
server.stderr.on('data', (b) => { serverLog += b; });

const shutdown = (code) => { server.kill('SIGKILL'); process.exit(code); };
process.on('uncaughtException', (e) => { console.error('\nUNCAUGHT', e); console.error(serverLog); shutdown(1); });

try {
  await new Promise((res, rej) => {
    const t0 = Date.now();
    const iv = setInterval(async () => {
      try {
        const r = await fetch(`http://127.0.0.1:${PORT}/health`);
        if (r.ok) { clearInterval(iv); res(); }
      } catch {
        if (Date.now() - t0 > 8000) { clearInterval(iv); rej(new Error('server never came up:\n' + serverLog)); }
      }
    }, 100);
  });

  console.log('\nhttp');
  {
    const h = await (await fetch(`http://127.0.0.1:${PORT}/health`)).json();
    ok(h.ok && h.protocol === PROTOCOL_VERSION, `health reports protocol ${h.protocol}`);
    const idx = await fetch(`http://127.0.0.1:${PORT}/`);
    ok(idx.status === 200 || idx.status === 404, 'the root path is routed');
    const trav = await fetch(`http://127.0.0.1:${PORT}/../../etc/passwd`);
    ok(trav.status === 403 || trav.status === 404, `path traversal is refused (${trav.status})`);
    const info = await (await fetch(`http://127.0.0.1:${PORT}/api/info`)).json();
    ok(Array.isArray(info.mapIds) && info.mapIds.length >= 4, `the map list is published (${info.mapIds.length} maps)`);
  }

  console.log('\nlobby');
  const host = new TestClient('HOSTPLAYER');
  await host.connect();
  await host.waitFor((c) => c.id);
  ok(!!host.token, 'the server issues a reconnection token on connect');
  host.hello();
  await sleep(120);

  host.lobbyAction({ action: 'create', config: { mode: 'ffa', mapId: 'reactor', botCount: 2, botDifficulty: 'easy', duration: 60, scoreLimit: 5 } });
  await host.waitFor((c) => c.lobby && c.lobby.code);
  const lob = host.lobby;
  ok(!!lob.code && lob.code.length === 4, `a room was created with code ${lob.code}`);
  ok(lob.isHost === true, 'the creator is the host');
  ok(lob.config.mapId === 'reactor' && lob.config.botCount === 2, 'the requested setup was applied');

  const guest = new TestClient('GUESTPLAYER');
  await guest.connect();
  await guest.waitFor((c) => c.id);
  guest.hello();
  await sleep(100);
  guest.lobbyAction({ action: 'join', code: lob.code });
  await guest.waitFor((c) => c.lobby && c.lobby.roster && c.lobby.roster.length === 2);
  ok(true, 'a second player joined by room code');
  ok(guest.lobby.isHost === false, 'the joiner is not the host');

  guest.lobbyAction({ action: 'config', config: { mapId: 'dunes' } });
  await sleep(200);
  ok(host.lobby.config.mapId === 'reactor', 'a non-host cannot change the setup');
  ok(guest.json.some((m) => m.t === MSG.ERROR), 'and is told why');

  host.lobbyAction({ action: 'config', config: { mapId: 'foundry', duration: 45 } });
  await guest.waitFor((c) => c.lobby.config.mapId === 'foundry');
  ok(true, 'the host can change the setup and everyone sees it');

  console.log('\nmatch');
  host.lobbyAction({ action: 'start' });
  await host.waitFor((c) => c.matchStart);
  const ms = host.matchStart;
  await guest.waitFor((c) => c.matchStart);
  ok(!!ms.you, 'the match start message names your player id');
  ok(ms.roster.filter((r) => r.bot).length === 2, 'the bots joined the roster');
  ok(ms.roster.filter((r) => r.bot).every((r) => r.name && r.difficulty), 'bots are labelled as bots with a difficulty');

  await host.waitFor((c) => c.snapshots.length > 3);
  const s0 = host.snapshots[host.snapshots.length - 1];
  ok(s0.players.length === 4, `snapshots carry every player (${s0.players.length})`);
  ok(s0.selfId === ms.you, 'the snapshot identifies which player is you');

  await host.waitFor((c) => c.snapshots.some((s) => s.state === GAME_STATE.LIVE), 6000);
  ok(true, 'the countdown completed and the match went live');

  const me = () => { const s = host.snapshots[host.snapshots.length - 1]; return s.players.find((p) => p.id === ms.you); };
  await host.waitFor(() => me() && (me().flags & FLAG.ALIVE));
  /* Sprint each way in turn. A single fixed heading sometimes starts a
     player facing a wall, which is a property of the spawn rather than of
     the input path being tested. */
  let best = 0;
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const before = me();
    const t0 = Date.now();
    while (Date.now() - t0 < 700) { host.input({ moveZ: 1, buttons: BTN.SPRINT, yaw }, 4); await sleep(16); }
    await sleep(120);
    const after = me();
    best = Math.max(best, Math.hypot(after.x - before.x, after.z - before.z));
  }
  ok(best > 3, `input moves the player on the server (${best.toFixed(1)} units in the clearest direction)`);

  const s1 = host.snapshots[host.snapshots.length - 1];
  ok(s1.ackSeq > 0, `the server acknowledges input sequence numbers (ack ${s1.ackSeq})`);
  ok(s1.self.mag > 0, `your own ammo is in the snapshot (${s1.self.mag})`);

  host.events.length = 0;
  const t1 = Date.now();
  while (Date.now() - t1 < 900) { host.input({ buttons: BTN.FIRE, yaw: 1 }, 4); await sleep(16); }
  await sleep(300);
  ok(host.events.some((e) => e.t === EV.SHOT), 'firing produces shot events for the client to render');
  const s2 = host.snapshots[host.snapshots.length - 1];
  ok(s2.self.mag < s1.self.mag, `ammo is spent server-side (${s1.self.mag} -> ${s2.self.mag})`);

  console.log('\nrobustness');
  {
    // Garbage must not take the server down.
    host.ws.send('not json at all');
    host.ws.send(JSON.stringify({ t: 999, d: null }));
    host.ws.send(new Uint8Array([2, 200, 0, 0, 0, 0]).buffer);   // claims 200 commands
    await sleep(250);
    const h = await (await fetch(`http://127.0.0.1:${PORT}/health`)).json();
    ok(h.ok, 'malformed messages leave the server running');
    ok(host.ws.readyState === 1, 'and do not drop the connection that sent them');
  }
  {
    const rooms = await (await fetch(`http://127.0.0.1:${PORT}/api/rooms`)).json();
    ok(rooms.rooms.length >= 1 && rooms.rooms[0].code === lob.code, 'the room shows in the server browser');
  }
  {
    // Reconnect with the same token and get the same player back.
    const kills = 0;
    const oldId = guest.matchStart.you;
    const token = guest.token;
    guest.close();
    await sleep(250);
    const back = new TestClient('GUESTPLAYER');
    await back.connect();
    await back.waitFor((c) => c.id);
    back.hello({ token });
    await sleep(150);
    back.lobbyAction({ action: 'join', code: lob.code });
    await back.waitFor((c) => c.matchStart, 4000);
    ok(back.matchStart.you === oldId, `reconnecting with the same token restores the same player (${oldId})`);
    back.close();
  }

  console.log('\nteardown');
  host.close();
  await sleep(300);
  const h2 = await (await fetch(`http://127.0.0.1:${PORT}/health`)).json();
  ok(h2.ok, 'the server survives every client leaving');
  ok(h2.tickMs < 8, `the room loop costs ${h2.tickMs} ms per tick`);
} catch (err) {
  console.error('\nERROR:', err.message);
  console.error(serverLog);
  fail++;
}

console.log(`\n${pass} passed, ${fail} failed`);
shutdown(fail ? 1 : 0);
