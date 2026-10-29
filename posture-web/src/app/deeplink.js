// 딥 모드 PC 쪽 연결 (F8·F10). 서버 프로토콜은 docs/prd.md 6절·shared/deep-protocol.js를 따른다.
// 연결 상태만 메모리에 두고, 측면 입력은 최신 1개만 판정에 넘긴다(기록하지 않는다).
import { CONNECTION_PILOT } from '../../shared/deep-protocol.js';

export const relayUrl = (role) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/relay?role=${role}`;

export class PcLink {
  constructor() {
    this.listeners = new Set();
    this.#clear();
  }

  #clear() {
    this.ws = null;
    this.status = 'closed';   // closed | connecting | open
    this.offset = 0;          // 서버 시각 - 이 PC 시각
    this.qr = null;           // { token, issuedAt, expiresAt }
    this.request = null;      // { requestId, requestedAt }
    this.linkId = null;
    this.side = null;         // 최신 측면 입력
    this.idle = false;        // 측면 입력 갱신 중단
    this.lostReason = null;
    this.stop = { status: 'none' }; // none | requested | confirmed | unconfirmed
    this.error = null;
  }

  onChange(listener) {
    this.listeners.add(listener);
  }

  get linked() {
    return Boolean(this.linkId);
  }

  serverNow() {
    return Date.now() + this.offset;
  }

  open() {
    if (this.ws) return;
    const ws = new WebSocket(relayUrl('pc'));
    this.ws = ws;
    this.status = 'connecting';
    ws.onmessage = (event) => this.#receive(JSON.parse(event.data));
    ws.onerror = () => {
      this.error = '연결 서버에 접속하지 못했어요. 이 주소에서는 딥 모드를 쓸 수 없을 수 있어요.';
      this.#emit();
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      clearInterval(this.pinger);
      const wasLinked = this.linked;
      const { stop } = this;
      this.#clear();
      if (wasLinked) this.lostReason = 'pc_closed';
      this.stop = stop.status === 'requested' ? { status: 'unconfirmed', reason: 'pc_closed' } : stop;
      this.#emit();
    };
    this.pinger = setInterval(() => this.#send({ type: 'ping' }), CONNECTION_PILOT.heartbeatSeconds * 1000);
  }

  close() {
    clearInterval(this.pinger);
    const ws = this.ws;
    this.#clear();
    ws?.close();
    this.#emit();
  }

  issue() {
    this.#send({ type: 'qr.issue' });
  }

  approve() {
    if (this.request) this.#send({ type: 'connect.approve', requestId: this.request.requestId });
  }

  reject() {
    if (this.request) this.#send({ type: 'connect.reject', requestId: this.request.requestId });
    this.request = null;
    this.#emit();
  }

  /** 촬영 종료 요청. 연결이 이미 없으면 요청할 수 없으므로 '확인 안 됨'으로 남긴다. */
  requestStop() {
    if (!this.linked) {
      this.stop = { status: 'unconfirmed', reason: 'not_linked' };
    } else {
      this.stop = { status: 'requested' };
      this.#send({ type: 'stop.request' });
    }
    this.#emit();
  }

  #send(message) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(message));
  }

  #receive(m) {
    switch (m.type) {
      case 'hello':
        this.offset = m.serverTime - Date.now();
        this.status = 'open';
        this.issue();
        break;
      case 'pong':
        this.offset = m.serverTime - Date.now();
        break;
      case 'qr.issued':
        this.qr = { token: m.token, issuedAt: m.issuedAt, expiresAt: m.expiresAt };
        this.request = null;
        this.error = null;
        break;
      case 'connect.requested':
        this.request = { requestId: m.requestId, requestedAt: m.requestedAt };
        break;
      case 'connect.canceled':
        this.request = null;
        break;
      case 'link.approved':
        this.linkId = m.linkId;
        this.request = null;
        this.lostReason = null;
        this.side = null;
        this.idle = false;
        this.stop = { status: 'none' };
        break;
      case 'side':
        this.side = m;
        this.idle = false;
        break;
      case 'link.input-idle':
        this.idle = true;
        break;
      case 'link.input-resumed':
        this.idle = false;
        break;
      case 'link.lost':
        this.linkId = null;
        this.side = null;
        this.lostReason = m.reason;
        break;
      case 'stop.confirmed':
        this.stop = { status: 'confirmed' };
        this.linkId = null;
        break;
      case 'stop.unconfirmed':
        this.stop = { status: 'unconfirmed', reason: m.reason };
        this.linkId = null;
        break;
      case 'error':
        this.error = m.message;
        break;
      default:
        break;
    }
    this.#emit();
  }

  #emit() {
    this.listeners.forEach((listener) => listener(this));
  }
}
