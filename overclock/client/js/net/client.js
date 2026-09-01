/* The network facade.
 *
 * Owns the protocol conversation and nothing else: what arrives, in what
 * order, and what the round-trip time is. Prediction and interpolation are
 * deliberately elsewhere, because they are the same problem whether the
 * bytes came off a socket or out of the tab.
 */

import { MSG, PROTOCOL_VERSION } from '../../../shared/constants.js';
import { encodeJson, decodeJson, encodeInput, decodeSnapshot } from '../../../shared/protocol.js';

export class NetClient {
  constructor() {
    this.transport = null;
    this.id = 0;
    this.token = localStorage.getItem('overclock.token') || null;
    this.ping = 0;
    this.pingSamples = [];
    this.connected = false;
    this.lastSnapshotAt = 0;
    this.snapshotGap = 0;
    this.bytesIn = 0;
    this.bytesOut = 0;
    this.rateWindow = { at: 0, in: 0, out: 0, kbIn: 0, kbOut: 0 };
    this.on = {
      welcome: null, lobby: null, matchStart: null, snapshot: null,
      events: null, matchEnd: null, error: null, chat: null, close: null,
      scores: null,
    };
    this._clock = { offset: 0, set: false };
  }

  async connect(transport) {
    this.close();
    this.transport = transport;
    transport.onmessage = (data, binary) => this._recv(data, binary);
    transport.onclose = (code, reason) => {
      this.connected = false;
      if (this.on.close) this.on.close(code, reason);
    };
    await transport.connect();
    this._saidHello = false;
    this.connected = true;
    return this;
  }

  close() {
    if (this.transport) { try { this.transport.close(); } catch {} }
    this.transport = null;
    this.connected = false;
  }

  get isLocal() { return !!(this.transport && this.transport.local); }

  /* Once per connection. A second HELLO would be answered with a second
     WELCOME, and anything that reacts to WELCOME by saying HELLO turns
     that into a loop the server sees as flooding. */
  hello(profile) {
    if (this._saidHello) return;
    this._saidHello = true;
    this.send(MSG.HELLO, {
      name: profile.name, skin: profile.skin, loadout: profile.loadout,
      token: this.token || undefined,
    });
  }

  send(type, payload) {
    if (!this.transport) return;
    const s = encodeJson(type, payload);
    this.bytesOut += s.length;
    this.transport.send(s);
  }

  lobby(action, extra = {}) { this.send(MSG.LOBBY_ACTION, { action, ...extra }); }
  chat(text) { this.send(MSG.CHAT, { text }); }
  setLoadout(loadout) { this.send(MSG.SWITCH_WEAPON, loadout); }

  sendInput(cmds, clientTime) {
    if (!this.transport || !cmds.length) return;
    const buf = encodeInput(cmds, clientTime);
    this.bytesOut += buf.byteLength;
    this.transport.send(buf);
  }

  update(dtMs) {
    if (this.transport) this.transport.update(dtMs);
    const now = performance.now();
    if (now - this.rateWindow.at > 1000) {
      const dt = (now - this.rateWindow.at) / 1000;
      if (this.rateWindow.at) {
        this.rateWindow.kbIn = (this.bytesIn - this.rateWindow.in) / dt / 1024;
        this.rateWindow.kbOut = (this.bytesOut - this.rateWindow.out) / dt / 1024;
      }
      this.rateWindow.at = now;
      this.rateWindow.in = this.bytesIn;
      this.rateWindow.out = this.bytesOut;
    }
  }

  _recv(data, binary) {
    if (binary) {
      this.bytesIn += data.byteLength || data.length || 0;
      const snap = decodeSnapshot(data);
      if (!snap) return;
      const now = performance.now();
      if (this.lastSnapshotAt) this.snapshotGap = this.snapshotGap * 0.8 + (now - this.lastSnapshotAt) * 0.2;
      this.lastSnapshotAt = now;
      /* Round trip measured from the client stamp the server echoes.
         The server also pings us for its own copy — this one is for the
         HUD and for sizing the interpolation buffer. */
      if (snap.clientTime) {
        const rtt = (now & 0xffffffff) - snap.clientTime;
        if (rtt >= 0 && rtt < 4000) this._sample(rtt);
      }
      if (this.on.snapshot) this.on.snapshot(snap);
      return;
    }

    this.bytesIn += data.length;
    const msg = decodeJson(data);
    if (!msg) return;
    const d = msg.d;
    switch (msg.t) {
      case MSG.WELCOME:
        this.id = d.id;
        if (d.token) { this.token = d.token; try { localStorage.setItem('overclock.token', d.token); } catch {} }
        if (d.protocol !== PROTOCOL_VERSION && this.on.error) {
          this.on.error(`Server protocol ${d.protocol}, client ${PROTOCOL_VERSION}. Reload the page.`);
        }
        if (this.on.welcome) this.on.welcome(d);
        return;
      case MSG.LOBBY_STATE: if (this.on.lobby) this.on.lobby(d); return;
      case MSG.MATCH_START: if (this.on.matchStart) this.on.matchStart(d); return;
      case MSG.MATCH_END: if (this.on.matchEnd) this.on.matchEnd(d); return;
      case MSG.EVENT: if (this.on.events) this.on.events(d); return;
      case MSG.SCORES: if (this.on.scores) this.on.scores(d); return;
      case MSG.CHAT: if (this.on.chat) this.on.chat(d); return;
      case MSG.ERROR: if (this.on.error) this.on.error(d.message); return;
      case MSG.PING:
        // The server measuring us. Answer immediately and unconditionally.
        this.send(MSG.PONG, { t: d.t });
        return;
      case MSG.PONG: {
        const rtt = Date.now() - d.t;
        if (rtt >= 0 && rtt < 4000) this._sample(rtt);
        return;
      }
      default: return;
    }
  }

  /* Median of the last few samples rather than a running average: one
     stalled packet should not make the HUD claim 400 ms of ping. */
  _sample(rtt) {
    this.pingSamples.push(rtt);
    if (this.pingSamples.length > 9) this.pingSamples.shift();
    const sorted = [...this.pingSamples].sort((a, b) => a - b);
    this.ping = Math.round(sorted[sorted.length >> 1]);
  }
}
