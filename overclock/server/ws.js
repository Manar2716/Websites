/* A WebSocket server, implemented directly on the HTTP upgrade.
 *
 * The rest of this repository has no dependencies and no build step, and
 * a game server is a poor reason to break that: RFC 6455 framing is a
 * couple of hundred lines and every one of them is visible here. What it
 * supports is what a game needs — text and binary messages, fragmentation,
 * ping/pong, and a clean close. What it does not support is what a game
 * does not need: extensions, permessage-deflate, and subprotocols.
 *
 * Two limits exist for safety rather than for the protocol: a maximum
 * message size, and a cap on how much unsent data may queue on a slow
 * socket before the connection is dropped. Without the second one, a
 * client that stops reading becomes a memory leak on the server.
 */

import { createHash } from 'node:crypto';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const OP = { CONT: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa };

const MAX_MESSAGE = 256 * 1024;
const MAX_BACKLOG = 2 * 1024 * 1024;

export class WSConnection {
  constructor(socket, req) {
    this.socket = socket;
    this.req = req;
    this.open = true;
    this.onmessage = null;
    this.onclose = null;
    this.remote = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || socket.remoteAddress || '?';

    this._buf = Buffer.alloc(0);
    this._frag = null;
    this._fragOp = 0;
    this._closing = false;
    this.bytesIn = 0;
    this.bytesOut = 0;

    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('error', () => this.close(1011, 'socket error'));
    socket.on('close', () => this._finish());
    socket.setNoDelay(true);        // a 40 ms Nagle delay is a third of a snapshot
  }

  _onData(chunk) {
    if (!this.open) return;
    this.bytesIn += chunk.length;
    this._buf = this._buf.length ? Buffer.concat([this._buf, chunk]) : chunk;
    for (;;) {
      const frame = this._readFrame();
      if (!frame) break;
      this._handleFrame(frame);
      if (!this.open) break;
    }
  }

  _readFrame() {
    const b = this._buf;
    if (b.length < 2) return null;
    const fin = (b[0] & 0x80) !== 0;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let off = 2;
    if (len === 126) {
      if (b.length < off + 2) return null;
      len = b.readUInt16BE(off); off += 2;
    } else if (len === 127) {
      if (b.length < off + 8) return null;
      const hi = b.readUInt32BE(off), lo = b.readUInt32BE(off + 4);
      if (hi !== 0) { this.close(1009, 'message too large'); return null; }
      len = lo; off += 8;
    }
    if (len > MAX_MESSAGE) { this.close(1009, 'message too large'); return null; }
    /* Every frame from a client must be masked. An unmasked one is either
       a broken client or a proxy-poisoning attempt, and the spec says to
       fail the connection either way. */
    if (!masked) { this.close(1002, 'unmasked frame'); return null; }
    if (b.length < off + 4 + len) return null;
    const key = b.subarray(off, off + 4); off += 4;
    const payload = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) payload[i] = b[off + i] ^ key[i & 3];
    off += len;
    this._buf = b.subarray(off);
    return { fin, opcode, payload };
  }

  _handleFrame(f) {
    switch (f.opcode) {
      case OP.PING: this._send(OP.PONG, f.payload); return;
      case OP.PONG: return;
      case OP.CLOSE: {
        const code = f.payload.length >= 2 ? f.payload.readUInt16BE(0) : 1005;
        this._send(OP.CLOSE, f.payload.subarray(0, 2));
        this._finish(code);
        return;
      }
      case OP.TEXT:
      case OP.BINARY:
        if (this._frag) { this.close(1002, 'interleaved fragments'); return; }
        if (!f.fin) { this._frag = [f.payload]; this._fragOp = f.opcode; return; }
        this._deliver(f.opcode, f.payload);
        return;
      case OP.CONT: {
        if (!this._frag) { this.close(1002, 'stray continuation'); return; }
        this._frag.push(f.payload);
        const total = this._frag.reduce((a, p) => a + p.length, 0);
        if (total > MAX_MESSAGE) { this.close(1009, 'message too large'); return; }
        if (f.fin) {
          const joined = Buffer.concat(this._frag);
          this._frag = null;
          this._deliver(this._fragOp, joined);
        }
        return;
      }
      default:
        this.close(1002, 'bad opcode');
    }
  }

  _deliver(opcode, payload) {
    if (!this.onmessage) return;
    if (opcode === OP.TEXT) this.onmessage(payload.toString('utf8'), false);
    else this.onmessage(payload, true);
  }

  send(data) {
    if (!this.open) return false;
    if (typeof data === 'string') return this._send(OP.TEXT, Buffer.from(data, 'utf8'));
    const buf = Buffer.isBuffer(data) ? data
      : data instanceof ArrayBuffer ? Buffer.from(data)
      : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    return this._send(OP.BINARY, buf);
  }

  _send(opcode, payload) {
    if (!this.open || this.socket.destroyed) return false;
    /* A client that has stopped reading must not be allowed to grow the
       server's memory without bound. */
    if (this.socket.writableLength > MAX_BACKLOG) { this.close(1013, 'too slow'); return false; }
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.allocUnsafe(2);
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.allocUnsafe(4);
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.allocUnsafe(10);
      header[1] = 127;
      header.writeUInt32BE(0, 2);
      header.writeUInt32BE(len, 6);
    }
    header[0] = 0x80 | opcode;      // server frames are never masked
    this.bytesOut += header.length + len;
    return this.socket.write(len ? Buffer.concat([header, payload]) : header);
  }

  ping() { this._send(OP.PING, Buffer.alloc(0)); }

  close(code = 1000, reason = '') {
    if (!this.open || this._closing) return;
    this._closing = true;
    const r = Buffer.from(reason.slice(0, 120), 'utf8');
    const payload = Buffer.allocUnsafe(2 + r.length);
    payload.writeUInt16BE(code, 0);
    r.copy(payload, 2);
    this._send(OP.CLOSE, payload);
    /* Give the close frame a moment to leave before tearing the socket
       down, but never wait on a peer that has already gone away. */
    setTimeout(() => this.socket.destroy(), 60).unref?.();
    this._finish(code);
  }

  _finish(code = 1006) {
    if (!this.open) return;
    this.open = false;
    if (this.onclose) this.onclose(code);
  }
}

/* Attach to a node http.Server. `onConnection(conn, req)` is called once
   the handshake has completed. */
export function attachWebSocket(httpServer, path, onConnection) {
  httpServer.on('upgrade', (req, socket, head) => {
    const url = (req.url || '').split('?')[0];
    if (path && url !== path) { socket.destroy(); return; }
    const key = req.headers['sec-websocket-key'];
    const version = req.headers['sec-websocket-version'];
    const upgrade = (req.headers.upgrade || '').toLowerCase();
    if (upgrade !== 'websocket' || !key || version !== '13') {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    const conn = new WSConnection(socket, req);
    if (head && head.length) conn._onData(head);
    onConnection(conn, req);
  });
}
