// 딥 모드 연결 클라이언트 (F8·F10, docs/prd.md 6절). /relay WebSocket과 동일 브라우저 탭 폴백을 제공한다.
// 화면(DOM)을 다루지 않는다. 화면은 status·notice 같은 상태를 읽어 그리고, on()으로 유실·종료 요청을 받는다.
import { CONNECTION_PILOT } from '../../shared/deep-protocol.js';
import { ClockOffset, sideQuality } from '../core/deep.js';
import { BroadcastRelay } from '../../shared/broadcast-relay.js';

const HEARTBEAT_MS = CONNECTION_PILOT.heartbeatSeconds * 1000;
const OPEN = 1;

export function relayUrl(role, loc = globalThis.location) {
  const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${loc.host}/relay?role=${role}`;
}

export const phoneUrl = (origin, token) => `${origin}/phone?token=${encodeURIComponent(token)}`;

export const LINK_STATUS_LABELS = {
  idle: '-',
  connecting: '연결 서버 접속 중',
  ready: 'QR 준비 전',
  issued: '휴대폰 연결 요청 대기',
  requested: '승인 대기',
  linked: '연결됨',
  lost: '연결 끊김',
  stopped: '연결 종료',
  offline: '연결 서버 끊김',
};

export const SIDE_QUALITY_LABELS = {
  valid: '유효',
  side_stale: '입력 지연·중단',
  side_unrecognized: '귀·어깨를 찾지 못함',
};

/** 연결·heartbeat·서버 시각 보정. status: idle → connecting → ready → (역할별 상태) | offline */
class RelayClient {
  constructor(role, { url, WebSocketImpl = globalThis.WebSocket,
    BroadcastChannelImpl = typeof window === 'undefined' ? null : globalThis.BroadcastChannel,
    connectTimeoutMs = 2000, now = Date.now } = {}) {
    this.role = role;
    this.url = url ?? relayUrl(role);
    this.WebSocketImpl = WebSocketImpl;
    this.BroadcastChannelImpl = BroadcastChannelImpl;
    this.connectTimeoutMs = connectTimeoutMs;
    this.connectTimer = null;
    this.transport = null;
    this.now = now;
    this.clock = new ClockOffset();
    this.status = 'idle';
    this.notice = '';
    this.ws = null;
    this.timer = null;
    this.pingAt = null;
    this.lastPingAt = null;
    this.listeners = new Set();
  }

  /** 이벤트 구독. 해지 함수를 돌려준다. */
  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(type, detail) {
    this.listeners.forEach((listener) => listener(type, detail));
  }

  /**
   * 주기 tick(main.js의 워커 타이머)에서 부른다. 백그라운드 탭은 setInterval이 크게 늦춰질 수 있어서
   * heartbeat를 워커 tick으로도 보낸다(다른 탭·IDE를 보는 동안 연결 유실로 처리되지 않게).
   */
  heartbeat(now = this.now()) {
    if (this.ws?.readyState !== OPEN) return;
    if (this.lastPingAt !== null && now - this.lastPingAt < HEARTBEAT_MS) return;
    this.#ping(now);
  }

  open() {
    if (this.ws) return;
    this.status = 'connecting';
    this.notice = '';
    this.clock = new ClockOffset();
    this.lastPingAt = null;
    this.pingAt = null;
    this.transport = 'websocket';
    try {
      const ws = new this.WebSocketImpl(this.url);
      this.#attach(ws);
      // TCP 접속뿐 아니라 프로토콜 hello까지 기다린다. 정적 호스팅의 무응답도 전환한다.
      this.connectTimer = setTimeout(() => {
        if (this.ws === ws) this.#fallback(ws);
      }, this.connectTimeoutMs);
    } catch {
      this.#fallback(null);
    }
  }

  #attach(ws) {
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.timer = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
    };
    ws.onmessage = (event) => {
      if (this.ws === ws) this.#receive(event.data);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      if (this.transport === 'websocket') this.#fallback(ws);
      else this.#offline();
    };
    ws.onerror = () => {
      if (this.ws === ws && this.transport === 'websocket') this.#fallback(ws);
    };
  }

  #fallback(ws) {
    if (this.ws !== ws) return;
    const hadConnection = this.clock.offset !== null;
    this.#teardown();
    ws?.close();
    // 승인된 연결이 유실됐다면 기존 입력을 폐기하고 새 QR·승인으로만 복구한다.
    if (hadConnection) this.closed();
    if (!this.BroadcastChannelImpl) { this.#offline(); return; }
    this.clock = new ClockOffset();
    this.lastPingAt = null;
    this.pingAt = null;
    this.status = 'connecting';
    this.transport = 'broadcast';
    try {
      this.#attach(new BroadcastRelay(this.role, { BroadcastChannelImpl: this.BroadcastChannelImpl, now: this.now }));
    } catch {
      this.#offline();
    }
    this.emit('change');
  }

  #offline() {
    this.#teardown();
    this.closed();
    this.emit('change');
  }

  close() {
    const ws = this.ws;
    this.#teardown();
    ws?.close();
    this.status = 'idle';
  }

  send(message) {
    if (this.ws?.readyState !== OPEN) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  /** 이 기기의 시각을 서버 시각으로 바꾼다. */
  serverNow(now = this.now()) {
    return this.clock.toServer(now);
  }

  #teardown() {
    clearInterval(this.timer);
    clearTimeout(this.connectTimer);
    this.connectTimer = null;
    this.timer = null;
    this.ws = null;
  }

  #ping(now) {
    this.pingAt = now;
    this.lastPingAt = now;
    this.send({ type: 'ping' });
  }

  #receive(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === 'hello') {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
      this.clock.hello(msg.serverTime, this.now());
      this.status = 'ready';
      this.ready();
    } else if (msg.type === 'pong') {
      if (this.pingAt !== null) this.clock.pong(msg.serverTime, this.pingAt, this.now());
      this.pingAt = null;
    } else {
      this.handle(msg);
    }
    this.emit('change');
  }

  ready() {}
  handle() {}
  closed() {}
}

/**
 * PC 쪽: QR 발급·승인·측면 입력 수신·종료 요청.
 * status: ready(QR 없음) | issued | requested(승인 대기) | linked | lost(연결 유실) | stopped(종료 확인·무응답으로 끝남) | offline
 */
export class PcLink extends RelayClient {
  constructor(options) {
    super('pc', options);
    this.#clearLink();
    this.stop = null; // { status: 'requested'|'confirmed'|'unconfirmed', reason, deadline }
  }

  #clearLink() {
    this.token = null;
    this.expiresAt = null;
    this.requestId = null;
    this.linkId = null;
    this.side = null;
    this.idle = false;
    this.lostReason = null;
  }

  get linked() { return this.status === 'linked'; }

  issueQr() {
    this.notice = '';
    this.send({ type: 'qr.issue' });
  }

  approve() {
    if (this.status === 'requested') this.send({ type: 'connect.approve', requestId: this.requestId });
  }

  reject() {
    if (this.status !== 'requested') return;
    this.send({ type: 'connect.reject', requestId: this.requestId });
    // 거절한 QR은 서버에서 다시 쓸 수 없게 된다.
    this.#clearLink();
    this.status = 'ready';
    this.notice = "연결 요청을 거절했어요. 다시 연결하려면 'QR 다시 만들기'를 눌러 주세요";
  }

  /** 촬영 종료 요청. 연결이 없으면 확인할 방법이 없으므로 '확인 안 됨'으로 남긴다. */
  requestStop() {
    if (this.stop?.status === 'requested') return;
    if (!this.linked) {
      this.stop = { status: 'unconfirmed', reason: this.lostReason ?? 'not_linked' };
      return;
    }
    this.stop = { status: 'requested', reason: null, deadline: null };
    this.send({ type: 'stop.request' });
  }

  qrExpired(now = this.now()) {
    return this.status === 'issued' && this.serverNow(now) >= this.expiresAt;
  }

  /** 정면 입력 시각(이 기기 시각)에 결합할 측면 입력과 그 품질 */
  sideInput(frontNow) {
    const quality = sideQuality(this.side, this.serverNow(frontNow), { idle: this.idle || !this.linked });
    return { quality, side: this.side };
  }

  handle(msg) {
    switch (msg.type) {
      case 'qr.issued':
        this.#clearLink();
        this.token = msg.token;
        this.expiresAt = msg.expiresAt;
        this.status = 'issued';
        break;
      case 'connect.requested':
        this.requestId = msg.requestId;
        this.status = 'requested';
        break;
      case 'connect.canceled':
        this.#clearLink();
        this.status = 'ready';
        this.notice = msg.reason === 'expired'
          ? "QR이 만료됐어요. 'QR 다시 만들기'를 눌러 주세요"
          : "휴대폰이 연결 요청을 취소했어요. 'QR 다시 만들기'를 눌러 주세요";
        break;
      case 'link.approved':
        this.#clearLink();
        this.linkId = msg.linkId;
        this.stop = null;
        this.status = 'linked';
        break;
      case 'side': {
        const { type, ...side } = msg;
        this.side = side;
        break;
      }
      case 'link.input-idle':
        this.idle = true;
        break;
      case 'link.input-resumed':
        this.idle = false;
        break;
      case 'link.lost':
        this.#lose(msg.reason);
        break;
      case 'stop.requested':
        if (this.stop) this.stop.deadline = msg.deadline;
        break;
      case 'stop.confirmed':
        this.stop = { status: 'confirmed', reason: null };
        this.side = null;
        this.status = 'stopped';
        this.emit('stop', 'confirmed');
        break;
      case 'stop.unconfirmed':
        this.stop = { status: 'unconfirmed', reason: msg.reason };
        this.side = null;
        this.status = 'stopped';
        this.emit('stop', 'unconfirmed');
        break;
      case 'error':
        this.notice = msg.message;
        if (msg.code === 'expired') {
          this.#clearLink();
          this.status = 'ready';
        }
        break;
      default:
    }
  }

  #lose(reason) {
    const wasLinked = this.linked;
    this.side = null;
    this.lostReason = reason;
    if (this.status !== 'stopped') this.status = 'lost';
    if (wasLinked) this.emit('lost', reason);
  }

  closed() {
    if (this.stop?.status === 'requested') {
      this.stop = { status: 'unconfirmed', reason: 'pc_closed' };
      this.emit('stop', 'unconfirmed');
    }
    this.#lose('pc_closed');
    this.status = 'offline';
    this.notice = '연결 서버와 연결이 끊겼어요. 다시 연결하려면 새 QR과 승인이 필요해요';
  }
}

/**
 * 휴대폰 쪽: 연결 요청·측면 입력 전송·종료 확인.
 * status: ready | requesting | pending(PC 승인 대기) | linked | stopped | revoked | rejected | offline
 */
export class PhoneLink extends RelayClient {
  constructor(options) {
    super('phone', options);
    this.seq = 0;
    this.linkId = null;
    this.reason = null;
  }

  requestConnect(token) {
    if (this.send({ type: 'connect.request', token })) this.status = 'requesting';
  }

  /** 측정한 측면 특징을 서버 시각과 함께 보낸다. 승인 전에는 보내지 않는다. */
  sendSide({ valid, angleDeg, earVis, shoulderVis }) {
    if (this.status !== 'linked') return false;
    const message = { type: 'side', seq: this.seq, t: Math.round(this.serverNow()), valid, angleDeg, earVis, shoulderVis };
    this.seq += 1;
    return this.send(message);
  }

  /** 촬영을 실제로 끈 뒤에 부른다. */
  confirmStop(stopId) {
    this.send({ type: 'stop.done', stopId });
  }

  handle(msg) {
    switch (msg.type) {
      case 'connect.pending':
        this.status = 'pending';
        break;
      case 'connect.rejected':
        this.status = 'rejected';
        this.reason = msg.code;
        this.notice = msg.message;
        break;
      case 'link.approved':
        this.linkId = msg.linkId;
        this.status = 'linked';
        break;
      case 'stop.request':
        this.emit('stop', msg.stopId);
        break;
      case 'link.closed':
        this.status = 'stopped';
        this.emit('end', msg.reason);
        break;
      case 'link.revoked':
        this.status = 'revoked';
        this.reason = msg.reason;
        this.emit('end', msg.reason);
        break;
      case 'error':
        this.notice = msg.message;
        break;
      default:
    }
  }

  closed() {
    const active = this.status === 'linked';
    if (!['stopped', 'revoked', 'rejected'].includes(this.status)) this.status = 'offline';
    if (active) this.emit('end', 'closed');
  }
}
