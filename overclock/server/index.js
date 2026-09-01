/* The dedicated server.
 *
 *   node server/index.js            # port 8080
 *   PORT=3000 node server/index.js
 *
 * Two jobs: serve the client as static files, and run the authoritative
 * simulation for every live room. Everything about what a message means
 * lives in shared/net/session.js, because the browser runs the same logic
 * to host an offline match — this file is only the node-shaped parts:
 * sockets, files and the clock.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { attachWebSocket } from './ws.js';
import { createSession, createClient, handleText, handleBinary, welcomePayload } from '../shared/net/session.js';
import { MSG, PROTOCOL_VERSION, TICK_DT } from '../shared/constants.js';
import { encodeJson } from '../shared/protocol.js';
import { WEAPON_IDS } from '../shared/weapons.js';
import { MAP_INFO, MAP_IDS } from '../shared/maps/index.js';
import { MODE_IDS } from '../shared/sim/modes.js';
import { DIFFICULTY_IDS } from '../shared/sim/bots.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const MSG_BUDGET_PER_SEC = 240;

const session = createSession();
const clients = new Set();
let avgTick = 0;

/* ── Static files ───────────────────────────────────────────────────── */
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

function serveStatic(req, res) {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);

  if (url === '/health') {
    return json(res, 200, {
      ok: true, protocol: PROTOCOL_VERSION,
      rooms: session.rooms.rooms.size, clients: clients.size,
      uptime: Math.round(process.uptime()), tickMs: +avgTick.toFixed(2),
    });
  }
  if (url === '/api/rooms') return json(res, 200, { rooms: session.rooms.list() });
  if (url === '/api/info') {
    return json(res, 200, {
      protocol: PROTOCOL_VERSION, maps: MAP_INFO, mapIds: MAP_IDS,
      modes: MODE_IDS, difficulties: DIFFICULTY_IDS, weapons: WEAPON_IDS,
    });
  }

  const rel = url === '/' ? '/index.html' : url;
  /* Resolve first, then check the result is still inside the root.
     Screening the input for '..' instead is the classic way to get this
     wrong, because it misses encodings and symlinks. */
  const file = path.resolve(ROOT, '.' + rel);
  if (!file.startsWith(ROOT + path.sep) && file !== ROOT) return text(res, 403, 'forbidden');

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return text(res, 404, 'not found');
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      /* The client is a set of ES modules loaded by URL, and a stale one
         against a fresh server is a protocol mismatch — so everything
         revalidates rather than being cached blind. */
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(file).pipe(res);
  });
}

const json = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
};
const text = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(body);
};

/* ── Connections ────────────────────────────────────────────────────── */
function onConnection(conn) {
  const client = createClient(session, (data) => { if (conn.open) conn.send(data); }, { token: randomUUID() });
  client.conn = conn;
  client.msgBudget = MSG_BUDGET_PER_SEC;
  clients.add(client);

  conn.onmessage = (data, binary) => {
    if (--client.msgBudget < 0) { conn.close(1008, 'flooding'); return; }
    try {
      const r = binary ? handleBinary(session, client, data) : handleText(session, client, data);
      if (r && r.close) conn.close(1002, r.close);
    } catch (err) {
      /* One client's malformed message must never take the server down
         for the other fifteen. */
      console.error('[client %d] %s', client.id, err && err.message);
      client.fail('bad message');
    }
  };

  conn.onclose = () => {
    if (client.room) client.room.remove(client);
    clients.delete(client);
  };

  client.send(encodeJson(MSG.WELCOME, welcomePayload(client)));
}

const server = http.createServer(serveStatic);
attachWebSocket(server, '/ws', onConnection);

/* ── Clock ──────────────────────────────────────────────────────────── */
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  let dt = now - last;
  last = now;
  if (dt > 250) dt = 250;             // a long stall is not simulated away
  const t0 = process.hrtime.bigint();
  session.rooms.update(dt);
  avgTick = avgTick * 0.95 + (Number(process.hrtime.bigint() - t0) / 1e6) * 0.05;
}, Math.round(TICK_DT * 1000));

// Message budgets refill once a second, and every client is pinged so the
// server has its own measurement of each round trip.
setInterval(() => {
  const now = Date.now();
  for (const c of clients) {
    c.msgBudget = MSG_BUDGET_PER_SEC;
    if (c.conn.open) c.send(encodeJson(MSG.PING, { t: now }));
  }
}, 1000);

server.listen(PORT, HOST, () => {
  console.log(`OVERCLOCK server on http://${HOST}:${PORT}  (protocol ${PROTOCOL_VERSION})`);
  console.log(`  client   http://localhost:${PORT}/`);
  console.log(`  health   http://localhost:${PORT}/health`);
});

process.on('SIGINT', () => {
  console.log('\nshutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500);
});
