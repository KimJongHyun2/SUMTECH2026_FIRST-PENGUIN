// 딥 모드 연결 서버 (F8·F10, docs/prd.md 6절). 형식·시간 값은 shared/deep-protocol.js.
// - PC가 QR 연결 토큰을 받고, 휴대폰이 그 토큰으로 요청하면 PC 승인 뒤에만 연결한다.
// - 승인된 휴대폰의 측면 특징·품질·시각만 그 PC로 전달하고, 입력 중단·연결 유실·종료 확인을 알린다.
// - 원본 영상·좌표·개인 기록 이력을 저장하지 않는다. 연결 상태는 메모리에만 두고 끝나면 지운다.
// 연결 상태는 ConnectionHub(시계를 주입할 수 있는 순수 로직)가, WebSocket 연결은 attachRelay가 맡는다.
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';
import {
  CONNECTION_PILOT, ERRORS, MAX_MESSAGE_BYTES, MAX_MESSAGES_PER_SECOND, TOKEN_PATTERN, parseSide,
} from './deep-protocol.js';

const SWEEP_MS = 500;
// 만료·사용된 토큰을 이 시간 동안 기억해 '만료/사용됨/재발급'을 구분해 알려 준 뒤 지운다.
const TOMBSTONE_MS = 10 * 60 * 1000;
// 휴대폰 시계 보정 오차를 고려해 이 이상 미래 시각의 입력은 받지 않는다.
const MAX_FUTURE_MS = 1000;

const newToken = () => randomBytes(18).toString('base64url'); // 24자, 144비트

export class ConnectionHub {
  constructor({ now = Date.now, token = newToken, pilot = CONNECTION_PILOT } = {}) {
    this.now = now;
    this.newToken = token;
    this.qrMs = pilot.qrExpirySeconds * 1000;
    this.heartbeatMs = pilot.heartbeatSeconds * 1000;
    this.disconnectMs = pilot.disconnectSeconds * 1000;
    this.phoneStopMs = pilot.phoneStopSeconds * 1000;
    this.staleMs = this.heartbeatMs;
    this.clients = new Set();
    this.tokens = new Map(); // token → { pc, issuedAt, state, phone, requestId, endedAt }
    this.seq = 0;
  }

  #id(prefix) {
    this.seq += 1;
    return `${prefix}${this.seq}-${randomBytes(4).toString('hex')}`;
  }

  // ------------------------------------------------------------ 연결 수명

  /** socket: { send(object), close(code, reason) } */
  connect(socket, role) {
    const t = this.now();
    const client = { socket, role, lastSeenAt: t, windowAt: t, count: 0, link: null, token: null };
    this.clients.add(client);
    this.#send(client, {
      type: 'hello',
      role,
      serverTime: t,
      qrExpiryMs: this.qrMs,
      heartbeatMs: this.heartbeatMs,
      disconnectMs: this.disconnectMs,
      phoneStopMs: this.phoneStopMs,
    });
    return client;
  }

  /** 소켓이 닫혔거나(closed) 응답이 끊겼을 때(timeout). 묶인 요청·연결을 모두 무효화한다. */
  disconnect(client, reason = 'closed') {
    if (!this.clients.delete(client)) return;
    const t = this.now();
    if (client.role === 'pc') {
      for (const entry of this.tokens.values()) {
        if (entry.pc !== client || !['issued', 'pending'].includes(entry.state)) continue;
        if (entry.state === 'pending') this.#reject(entry.phone, 'pc_offline');
        this.#retire(entry, 'closed', t);
      }
      if (client.link) this.#endLink(client.link, { phone: { type: 'link.revoked', reason: `pc_${reason}` } });
    } else {
      const entry = client.token && this.tokens.get(client.token);
      if (entry?.state === 'pending' && entry.phone === client) {
        // 요청한 휴대폰이 사라진 요청은 되살리지 않는다. PC는 새 QR로 다시 받는다.
        this.#retire(entry, 'used', t);
        this.#send(entry.pc, { type: 'connect.canceled', requestId: entry.requestId, reason: `phone_${reason}` });
      }
      if (client.link) {
        const { stop } = client.link;
        // 종료 확인을 기다리던 중 끊겨도 확인으로 보지 않는다. 연결이 끊긴 것은 카메라 종료의 증거가 아니다.
        if (stop) this.#send(client.link.pc, { type: 'stop.unconfirmed', stopId: stop.id, reason: `phone_${reason}` });
        this.#endLink(client.link, { pc: { type: 'link.lost', reason: `phone_${reason}` } });
      }
    }
  }

  /** 메시지 하나를 처리한다. raw는 받은 문자열이다. */
  receive(client, raw) {
    if (!this.clients.has(client)) return;
    const t = this.now();
    client.lastSeenAt = t;
    if (t - client.windowAt >= 1000) {
      client.windowAt = t;
      client.count = 0;
    }
    client.count += 1;
    if (client.count > MAX_MESSAGES_PER_SECOND) {
      this.#error(client, 'rate_limited');
      client.socket.close(1008, 'rate_limited');
      this.disconnect(client, 'closed');
      return;
    }
    let msg;
    try {
      if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_MESSAGE_BYTES) throw new Error();
      msg = JSON.parse(raw);
      if (!msg || typeof msg.type !== 'string') throw new Error();
    } catch {
      this.#error(client, 'bad_message');
      return;
    }
    // 처리기 객체가 직접 가진 이름만 인정한다. '__defineGetter__'·'constructor' 같은 상속 속성을 호출하면 서버가 죽는다.
    const handlers = client.role === 'pc' ? this.#pcHandlers : this.#phoneHandlers;
    const handler = Object.hasOwn(handlers, msg.type) ? handlers[msg.type] : null;
    if (msg.type === 'ping') this.#send(client, { type: 'pong', serverTime: t });
    else if (handler) handler.call(this, client, msg, t);
    else this.#error(client, 'bad_message');
  }

  /** 주기적으로 부른다: 응답 끊김·QR 만료·입력 중단·종료 확인 시간 초과·지난 기록 정리 */
  sweep() {
    const t = this.now();
    for (const client of [...this.clients]) {
      if (t - client.lastSeenAt > this.disconnectMs) {
        client.socket.close(4000, 'timeout');
        this.disconnect(client, 'timeout');
      }
    }
    for (const [token, entry] of this.tokens) {
      if (entry.state === 'issued' && t - entry.issuedAt >= this.qrMs) this.#retire(entry, 'expired', t);
      if (entry.state === 'pending' && t - entry.issuedAt >= this.qrMs) {
        // 승인 전 만료: 요청을 거부한다(승인 시점 검사와 같은 결과를 먼저 알린다).
        this.#reject(entry.phone, 'expired');
        this.#send(entry.pc, { type: 'connect.canceled', requestId: entry.requestId, reason: 'expired' });
        this.#retire(entry, 'expired', t);
      }
      if (entry.endedAt !== null && t - entry.endedAt > TOMBSTONE_MS) this.tokens.delete(token);
    }
    for (const link of this.#links()) {
      if (link.stop && t - link.stop.at >= this.phoneStopMs) {
        this.#endLink(link, {
          pc: { type: 'stop.unconfirmed', stopId: link.stop.id, reason: 'timeout' },
          phone: { type: 'link.revoked', reason: 'stop_timeout' },
        });
      } else if (!link.idle && t - link.lastSideAt > this.heartbeatMs) {
        link.idle = true;
        this.#send(link.pc, { type: 'link.input-idle', lastSideAt: link.lastSideAt, serverTime: t });
      }
    }
  }

  stats() {
    const live = [...this.tokens.values()].filter((e) => e.endedAt === null).length;
    return {
      pcs: [...this.clients].filter((c) => c.role === 'pc').length,
      phones: [...this.clients].filter((c) => c.role === 'phone').length,
      liveTokens: live,
      tokens: this.tokens.size,
      links: this.#links().length,
    };
  }

  // ------------------------------------------------------------ PC

  #pcHandlers = {
    'qr.issue'(pc, msg, t) {
      if (pc.link) return this.#error(pc, 'already_linked');
      // 이전 QR은 재발급으로 무효화한다. 대기 중이던 요청도 거부한다.
      for (const entry of this.tokens.values()) {
        if (entry.pc !== pc || !['issued', 'pending'].includes(entry.state)) continue;
        if (entry.state === 'pending') this.#reject(entry.phone, 'reissued');
        this.#retire(entry, 'reissued', t);
      }
      const token = this.newToken();
      this.tokens.set(token, { pc, issuedAt: t, state: 'issued', phone: null, requestId: null, endedAt: null });
      this.#send(pc, { type: 'qr.issued', token, issuedAt: t, expiresAt: t + this.qrMs });
    },

    'connect.approve'(pc, msg, t) {
      const entry = this.#pendingOf(pc, msg.requestId);
      if (!entry) return this.#error(pc, 'no_request');
      if (t - entry.issuedAt >= this.qrMs) {
        // 승인 시점에도 만료를 다시 확인한다.
        this.#reject(entry.phone, 'expired');
        this.#retire(entry, 'expired', t);
        return this.#error(pc, 'expired');
      }
      const phone = entry.phone;
      this.#retire(entry, 'used', t);
      const link = { id: this.#id('link'), pc, phone, approvedAt: t, lastSideAt: t, lastSeq: -1, idle: false, stop: null };
      pc.link = link;
      phone.link = link;
      this.#send(pc, { type: 'link.approved', linkId: link.id, requestId: msg.requestId, serverTime: t });
      this.#send(phone, { type: 'link.approved', linkId: link.id, serverTime: t });
    },

    'connect.reject'(pc, msg, t) {
      const entry = this.#pendingOf(pc, msg.requestId);
      if (!entry) return this.#error(pc, 'no_request');
      this.#reject(entry.phone, 'rejected');
      this.#retire(entry, 'used', t);
    },

    'stop.request'(pc, msg, t) {
      const link = pc.link;
      if (!link) return this.#error(pc, 'not_linked');
      if (link.stop) return; // 이미 요청 중이면 같은 요청으로 본다
      link.stop = { id: this.#id('stop'), at: t };
      this.#send(link.phone, { type: 'stop.request', stopId: link.stop.id });
      this.#send(pc, { type: 'stop.requested', stopId: link.stop.id, deadline: t + this.phoneStopMs });
    },
  };

  // ------------------------------------------------------------ 휴대폰

  #phoneHandlers = {
    'connect.request'(phone, msg, t) {
      if (phone.link || phone.token) return this.#reject(phone, 'duplicate');
      if (typeof msg.token !== 'string' || !TOKEN_PATTERN.test(msg.token)) return this.#reject(phone, 'invalid_token');
      const entry = this.tokens.get(msg.token);
      if (!entry) return this.#reject(phone, 'invalid_token');
      if (entry.state === 'issued' && t - entry.issuedAt >= this.qrMs) this.#retire(entry, 'expired', t);
      // 다른 휴대폰이 먼저 요청한 QR은 자동으로 넘기지 않는다.
      if (entry.state === 'pending') return this.#reject(phone, 'used');
      if (entry.state === 'closed') return this.#reject(phone, 'pc_offline');
      if (entry.state !== 'issued') return this.#reject(phone, entry.state);
      if (entry.pc.link) return this.#reject(phone, 'already_linked');
      entry.state = 'pending';
      entry.phone = phone;
      entry.requestId = this.#id('req');
      phone.token = msg.token;
      this.#send(phone, { type: 'connect.pending', requestId: entry.requestId });
      this.#send(entry.pc, { type: 'connect.requested', requestId: entry.requestId, requestedAt: t });
    },

    side(phone, msg, t) {
      const link = phone.link;
      if (!link) return this.#error(phone, 'not_approved');
      const side = parseSide(msg);
      if (!side || side.seq <= link.lastSeq || side.t - t > MAX_FUTURE_MS) return this.#error(phone, 'bad_side');
      link.lastSeq = side.seq;
      const ageMs = t - side.t;
      if (ageMs > this.staleMs) {
        this.#error(phone, 'stale_input');
        this.#send(link.pc, { type: 'side.stale', seq: side.seq, ageMs });
        return;
      }
      link.lastSideAt = t;
      if (link.idle) {
        link.idle = false;
        this.#send(link.pc, { type: 'link.input-resumed', serverTime: t });
      }
      this.#send(link.pc, { type: 'side', ...side, receivedAt: t });
    },

    'stop.done'(phone, msg) {
      const link = phone.link;
      if (!link?.stop || msg.stopId !== link.stop.id) return this.#error(phone, 'bad_message');
      this.#endLink(link, {
        pc: { type: 'stop.confirmed', stopId: link.stop.id },
        phone: { type: 'link.closed', reason: 'stopped' },
      });
    },
  };

  // ------------------------------------------------------------ 내부

  #links() {
    return [...this.clients].filter((c) => c.role === 'pc' && c.link).map((c) => c.link);
  }

  #pendingOf(pc, requestId) {
    for (const entry of this.tokens.values()) {
      if (entry.pc === pc && entry.state === 'pending' && entry.requestId === requestId) return entry;
    }
    return null;
  }

  /** 토큰을 다시 쓸 수 없게 끝낸다. 요청한 휴대폰의 토큰 표시도 지워 새 QR로 다시 요청할 수 있게 한다. */
  #retire(entry, state, t) {
    entry.state = state;
    entry.endedAt = t;
    if (entry.phone) entry.phone.token = null;
  }

  /** 연결을 끝내고 양쪽 승인을 무효화한다. 끝난 연결의 휴대폰 입력은 더 이상 전달하지 않는다. */
  #endLink(link, { pc, phone }) {
    link.pc.link = null;
    link.phone.link = null;
    if (pc && this.clients.has(link.pc)) this.#send(link.pc, pc);
    if (phone && this.clients.has(link.phone)) this.#send(link.phone, phone);
  }

  #reject(phone, code) {
    this.#send(phone, { type: 'connect.rejected', code, message: ERRORS[code] });
  }

  #error(client, code) {
    this.#send(client, { type: 'error', code, message: ERRORS[code] });
  }

  #send(client, message) {
    if (client) client.socket.send(message);
  }
}

/** Origin 헤더가 없거나(같은 사이트의 일반 요청) 같은 호스트일 때만 true. 'null'·잘못된 값은 다른 사이트로 본다. */
function sameSite(origin, host) {
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function reject(socket, status) {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

/**
 * HTTP 서버에 /relay WebSocket을 붙인다. role=pc|phone. 다른 사이트에서 연 페이지의 연결은 받지 않는다.
 * 한 연결의 잘못된 입력으로 서버 프로세스가 끝나지 않도록, 처리 중 예외는 그 연결만 닫는다.
 * @returns {{ hub: ConnectionHub, close(): void }}
 */
export function attachRelay(httpServer, { hub = new ConnectionHub(), log = console.error } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES * 2 });
  const timer = setInterval(() => {
    try {
      hub.sweep();
    } catch (error) {
      log('relay sweep 실패', error.message);
    }
  }, SWEEP_MS);
  timer.unref?.();

  httpServer.on('upgrade', (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return reject(socket, '400 Bad Request');
    }
    if (url.pathname !== '/relay') return; // 개발 서버의 HMR 연결은 건드리지 않는다
    const role = url.searchParams.get('role');
    if ((role !== 'pc' && role !== 'phone') || !sameSite(req.headers.origin, req.headers.host)) {
      return reject(socket, '403 Forbidden');
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const client = hub.connect({
        send: (message) => { if (ws.readyState === 1) ws.send(JSON.stringify(message)); },
        close: (code, reason) => ws.close(code, reason),
      }, role);
      // 토큰·메시지 내용은 기록하지 않는다.
      const guard = (fn) => (...args) => {
        try {
          fn(...args);
        } catch (error) {
          log('relay 메시지 처리 실패', error.message);
          ws.close(1011, 'internal_error');
        }
      };
      ws.on('message', guard((data, isBinary) => hub.receive(client, isBinary ? null : data.toString())));
      ws.on('close', guard(() => hub.disconnect(client, 'closed')));
      ws.on('error', () => ws.terminate());
    });
  });
  httpServer.on('close', () => clearInterval(timer));
  return {
    hub,
    close() {
      clearInterval(timer);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
