/* Transports.
 *
 * The game talks to a server. Sometimes that server is across the
 * internet, and sometimes it is thirty lines below in the same tab. Both
 * speak the identical protocol, so nothing above this file knows or cares
 * which one it has — offline practice is not a separate game mode written
 * twice, it is the same client with a shorter wire.
 */

import { createSession, createClient, handleText, handleBinary, welcomePayload, randomToken } from '../../../shared/net/session.js';
import { MSG } from '../../../shared/constants.js';
import { encodeJson } from '../../../shared/protocol.js';

export class WebSocketTransport {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.onmessage = null;
    this.onclose = null;
    this.onopen = null;
    this.local = false;
    this.state = 'idle';
  }

  connect(timeoutMs = 9000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      this.state = 'connecting';
      let ws;
      try { ws = new WebSocket(this.url); } catch (e) { this.state = 'failed'; reject(e); return; }
      this.ws = ws;
      ws.binaryType = 'arraybuffer';
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true; this.state = 'failed';
        try { ws.close(); } catch {}
        reject(new Error('The server did not answer in time.'));
      }, timeoutMs);
      ws.onopen = () => {
        if (settled) return;
        settled = true; clearTimeout(timer); this.state = 'open';
        if (this.onopen) this.onopen();
        resolve();
      };
      ws.onerror = () => {
        if (settled) return;
        settled = true; clearTimeout(timer); this.state = 'failed';
        reject(new Error('Could not reach the server.'));
      };
      ws.onclose = (e) => {
        this.state = 'closed';
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error('The connection closed before it opened.')); }
        else if (this.onclose) this.onclose(e.code, e.reason);
      };
      ws.onmessage = (e) => {
        if (!this.onmessage) return;
        if (typeof e.data === 'string') this.onmessage(e.data, false);
        else this.onmessage(new Uint8Array(e.data), true);
      };
    });
  }

  send(data) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return false;
    /* Never queue behind a socket that has stopped draining: for a game,
       a late input is worse than a dropped one. */
    if (ws.bufferedAmount > 512 * 1024) return false;
    ws.send(data);
    return true;
  }

  update() {}
  close() { try { this.ws && this.ws.close(1000, 'left'); } catch {} }
}

/* The offline server, running in this tab.
 *
 * It ticks from the render loop rather than from a timer, which keeps the
 * simulation in step with the frame you are about to draw and means a
 * backgrounded tab pauses rather than fast-forwarding. */
export class LocalTransport {
  constructor(opts = {}) {
    this.local = true;
    this.state = 'idle';
    this.onmessage = null;
    this.onclose = null;
    this.session = createSession();
    this.queue = [];
    /* Optional simulated latency, used by the network-conditions setting
       to let someone see what their prediction looks like at 120 ms. */
    this.latency = opts.latency || 0;
    this.client = createClient(this.session, (data) => this._deliver(data), { token: randomToken() });
  }

  connect() {
    this.state = 'open';
    this._deliver(encodeJson(MSG.WELCOME, welcomePayload(this.client)));
    return Promise.resolve();
  }

  _deliver(data) {
    this.queue.push({ at: performance.now() + this.latency, data });
  }

  send(data) {
    const run = () => {
      try {
        if (typeof data === 'string') handleText(this.session, this.client, data);
        else handleBinary(this.session, this.client, data);
      } catch (err) {
        console.error('local session error', err);
      }
    };
    if (this.latency) setTimeout(run, this.latency);
    else run();
    return true;
  }

  /* Called once per rendered frame. Steps the hosted match and flushes
     anything the session queued for us. */
  update(dtMs) {
    this.session.rooms.update(Math.min(dtMs, 100));
    if (!this.onmessage) { this.queue.length = 0; return; }
    const now = performance.now();
    while (this.queue.length && this.queue[0].at <= now) {
      const m = this.queue.shift();
      if (typeof m.data === 'string') this.onmessage(m.data, false);
      else this.onmessage(m.data instanceof ArrayBuffer ? new Uint8Array(m.data) : m.data, true);
    }
  }

  close() {
    this.state = 'closed';
    if (this.client.room) this.client.room.remove(this.client);
    this.queue.length = 0;
  }
}

/* Where the multiplayer server lives. Same origin by default, so the page
   works unchanged behind any host or tunnel; overridable for a client
   served from static hosting that talks to a server elsewhere. */
export function defaultServerUrl() {
  const override = new URLSearchParams(location.search).get('server');
  if (override) { const u = asWebSocketUrl(override); if (u) return u; }
  const stored = localStorage.getItem('overclock.server');
  if (stored) { const u = asWebSocketUrl(stored); if (u) return u; }
  if (location.protocol === 'file:') return null;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

/* The override comes from a query string or from local storage, so it is
   attacker-influenceable in the sense that a crafted link can set it.
   It can only point this one tab at a different game server, but there is
   no reason to let it be anything other than a WebSocket URL. */
function asWebSocketUrl(raw) {
  try {
    const u = new URL(raw, location.href);
    if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return null;
    return u.toString();
  } catch { return null; }
}
