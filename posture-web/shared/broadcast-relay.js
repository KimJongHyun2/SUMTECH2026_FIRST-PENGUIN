// 동일 출처 탭 사이의 중계다. PC가 기존 서버 상태 머신을 소유하고 휴대폰 메시지를 전달한다.
// 모든 메시지에 수신자 ID를 붙여 여러 PC·휴대폰 연결이 서로 섞이지 않게 한다.
import { ConnectionHub } from './connection-hub.js';
import { CONNECTION_PILOT, ERRORS } from './deep-protocol.js';

const CHANNEL = 'fast-turtle-relay-v1';
const DISCONNECT_MS = CONNECTION_PILOT.disconnectSeconds * 1000;

export class BroadcastRelay {
  constructor(role, { BroadcastChannelImpl, now = Date.now }) {
    this.role = role;
    this.now = now;
    this.id = crypto.randomUUID();
    this.host = null;
    this.readyState = 0;
    this.channel = new BroadcastChannelImpl(CHANNEL);
    this.channel.onmessage = (event) => this.#receive(event.data);
    this.lastSeen = now();
    this.peers = new Map();
    this.pending = null;
    if (role === 'pc') this.hub = new ConnectionHub({ now });
    this.timer = setInterval(() => {
      this.hub?.sweep();
      if (this.pending) {
        if (now() - this.pending.at >= DISCONNECT_MS) {
          this.pending = null;
          this.#deliver({ type: 'connect.rejected', code: 'pc_offline', message: ERRORS.pc_offline });
        } else {
          this.#post({ kind: 'input', to: this.host, raw: this.pending.raw });
        }
      }
      if (this.host && now() - this.lastSeen > DISCONNECT_MS) this.#lost();
    }, 500);
    // 호출자가 이벤트를 등록한 뒤 hello를 전달한다.
    queueMicrotask(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this.onopen?.();
      if (this.hub) {
        this.pc = this.hub.connect({ send: (msg) => this.#deliver(msg), close: () => this.#lost() }, 'pc');
      } else {
        this.#deliver({ type: 'hello', serverTime: now() });
      }
    });
  }

  #deliver(msg) {
    // WebSocket과 같은 비동기 순서로 전달해 전송 중 화면 상태가 덮어써지지 않게 한다.
    queueMicrotask(() => {
      if (this.readyState === 1) this.onmessage?.({ data: JSON.stringify(msg) });
    });
  }

  #post(packet) {
    if (this.readyState === 1) this.channel.postMessage({ ...packet, from: this.id });
  }

  send(raw) {
    if (this.readyState !== 1) return;
    if (this.hub) {
      this.hub.receive(this.pc, raw);
      return;
    }
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!this.host && msg.type === 'ping') {
      this.#deliver({ type: 'pong', serverTime: this.now() });
      return;
    }
    if (!this.host && msg.type === 'connect.request') this.pending = { raw, at: this.now() };
    this.#post({ kind: 'input', to: this.host, raw });
  }

  #receive(packet) {
    if (this.readyState !== 1 || !packet || typeof packet.from !== 'string' || packet.from === this.id) return;
    if (packet.to && packet.to !== this.id) return;
    if (this.hub) {
      let peer = this.peers.get(packet.from);
      if (packet.kind === 'close') {
        if (peer) this.hub.disconnect(peer);
        this.peers.delete(packet.from);
        return;
      }
      if (packet.kind !== 'input' || typeof packet.raw !== 'string') return;
      if (!peer) {
        // 최초 요청의 토큰으로 PC를 선택하고 승인 뒤에도 같은 상대의 입력만 받는다.
        let msg;
        try { msg = JSON.parse(packet.raw); } catch { return; }
        if (msg?.type !== 'connect.request' || !this.hub.tokens.has(msg.token)) return;
        peer = this.hub.connect({
          send: (message) => {
            if (message.type !== 'hello') this.#post({ kind: 'output', to: packet.from, message });
          },
          close: () => {
            this.#post({ kind: 'closed', to: packet.from });
            this.peers.delete(packet.from);
          },
        }, 'phone');
        this.peers.set(packet.from, peer);
      }
      this.hub.receive(peer, packet.raw);
    } else {
      if (packet.to !== this.id || (this.host && this.host !== packet.from)) return;
      if (packet.kind === 'closed') { this.#lost(); return; }
      if (packet.kind !== 'output' || !packet.message) return;
      this.pending = null;
      this.host = packet.from;
      this.lastSeen = this.now();
      this.#deliver(packet.message);
    }
  }

  #lost() {
    this.close();
    this.onclose?.();
  }

  close() {
    if (this.readyState === 3) return;
    if (this.hub && this.pc) this.hub.disconnect(this.pc);
    if (!this.hub) this.#post({ kind: 'close', to: this.host });
    this.readyState = 3;
    clearInterval(this.timer);
    this.channel.close();
    this.peers.clear();
  }
}
