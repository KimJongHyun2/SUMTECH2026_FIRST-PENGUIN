// 딥 모드 연결 클라이언트. 메시지 형식·시간 값은 백엔드 중계와 같은 posture-web/shared/deep-protocol.js를 따른다.
// 서버는 요청·승인·전달·유실·종료 확인만 다루고, 판정·세션·기록은 PC 브라우저가 한다.
// /relay WebSocket이 hello 전에 실패하면 같은 연결 상태 머신을 쓰는 동일 출처 탭 사이 BroadcastChannel 중계로 바꾼다.
import { BroadcastRelay } from "../../../../posture-web/shared/broadcast-relay.js";

export type RelayMessage = { type: string } & Record<string, unknown>;
export type Transport = "websocket" | "broadcast";
type Role = "pc" | "phone";
/** WebSocket과 BroadcastRelay가 공통으로 가진 부분 */
type RelaySocket = Pick<
  WebSocket,
  "readyState" | "onmessage" | "onerror" | "onclose" | "send" | "close"
>;
type Options = {
  WebSocketImpl?: typeof WebSocket;
  BroadcastChannelImpl?: typeof BroadcastChannel | null;
  /** WebSocket 접속 뒤 hello까지 기다리는 시간(ms) */
  connectTimeoutMs?: number;
};

const OPEN = 1;
const CONNECT_TIMEOUT_MS = 2000;
const defaultBase = () =>
  `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;

export class PairingService {
  private socket?: RelaySocket;
  private heartbeat?: ReturnType<typeof setInterval>;
  private connectTimer?: ReturnType<typeof setTimeout>;
  private ready = false;
  private current?: Transport;
  /** 서버 시각 − 이 기기 시각(ms). hello·pong의 serverTime으로 맞춘다. */
  private offset = 0;
  private readonly WebSocketImpl?: typeof WebSocket;
  private readonly BroadcastChannelImpl: typeof BroadcastChannel | null;
  private readonly connectTimeoutMs: number;
  constructor(
    private receive: (message: RelayMessage) => void,
    private base = defaultBase,
    options: Options = {},
  ) {
    this.WebSocketImpl = options.WebSocketImpl;
    this.BroadcastChannelImpl =
      options.BroadcastChannelImpl === undefined
        ? (globalThis.BroadcastChannel ?? null)
        : options.BroadcastChannelImpl;
    this.connectTimeoutMs = options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS;
  }
  get open() {
    return this.socket?.readyState === OPEN;
  }
  /** 지금 쓰는 연결 방식. 연결 전이나 닫힌 뒤에는 undefined다. */
  get transport() {
    return this.socket ? this.current : undefined;
  }
  /** hello를 받으면 onReady를 부르고, 응답 끊김 판정을 피하도록 heartbeat마다 ping을 보낸다. */
  connect(role: Role, onReady: () => void) {
    this.close();
    this.current = "websocket";
    let ws: RelaySocket;
    try {
      const WebSocketImpl = this.WebSocketImpl ?? WebSocket;
      ws = new WebSocketImpl(`${this.base()}/relay?role=${role}`);
    } catch {
      this.fallback(undefined, role, onReady);
      return;
    }
    this.attach(ws, role, onReady);
    // TCP 접속뿐 아니라 프로토콜 hello까지 기다린다. 정적 호스팅의 무응답도 전환한다.
    this.connectTimer = setTimeout(
      () => this.fallback(ws, role, onReady),
      this.connectTimeoutMs,
    );
  }
  private attach(socket: RelaySocket, role: Role, onReady: () => void) {
    this.socket = socket;
    socket.onmessage = (event) => {
      if (this.socket === socket) this.onMessage(event.data, onReady);
    };
    socket.onerror = () => {
      if (this.socket !== socket) return;
      if (this.canFallback) this.fallback(socket, role, onReady);
      else this.receive({ type: "socket.error" });
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      if (this.canFallback) return this.fallback(socket, role, onReady);
      this.close();
      this.receive({ type: "socket.closed" });
    };
  }
  /** hello를 받기 전의 WebSocket 실패만 폴백한다. 승인 뒤 유실은 새 QR·승인으로만 복구한다. */
  private get canFallback() {
    return this.current === "websocket" && !this.ready;
  }
  private fallback(
    failed: RelaySocket | undefined,
    role: Role,
    onReady: () => void,
  ) {
    if (this.socket !== failed) return;
    this.close();
    if (!this.BroadcastChannelImpl) {
      this.receive({ type: "socket.error" });
      return;
    }
    this.current = "broadcast";
    try {
      const relay = new BroadcastRelay(role, {
        BroadcastChannelImpl: this.BroadcastChannelImpl,
      }) as unknown as RelaySocket;
      this.attach(relay, role, onReady);
    } catch {
      this.close();
      this.receive({ type: "socket.error" });
    }
  }
  private onMessage(data: unknown, onReady: () => void) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(data));
    } catch {
      return;
    }
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      !("type" in parsed) ||
      typeof parsed.type !== "string"
    )
      return;
    const message = parsed as RelayMessage;
    if (message.type === "hello") {
      // 중복 hello로 QR 발급·연결 요청을 다시 실행하거나 잘못된 주기로 ping을 보내지 않는다.
      if (this.ready || !Number.isFinite(message.serverTime)) return;
      const every = message.heartbeatMs ?? 2000;
      if (
        !Number.isSafeInteger(every) ||
        Number(every) <= 0 ||
        Number(every) > 2147483647
      )
        return;
      clearTimeout(this.connectTimer);
      this.ready = true;
      clearInterval(this.heartbeat);
      this.offset = Number(message.serverTime) - Date.now();
      this.heartbeat = setInterval(
        () => this.send({ type: "ping" }),
        Number(every),
      );
      onReady();
    } else if (Number.isFinite(message.serverTime)) {
      this.offset = Number(message.serverTime) - Date.now();
    }
    if (message.type !== "pong") this.receive(message);
  }
  /** 이 기기 시각을 서버 시각으로 바꾼다. */
  toServer(localTime: number) {
    return Math.round(localTime + this.offset);
  }
  /** 서버 시각을 이 기기 시각으로 바꾼다. */
  toLocal(serverTime: number) {
    return serverTime - this.offset;
  }
  send(message: RelayMessage) {
    if (this.open) this.socket!.send(JSON.stringify(message));
  }
  close() {
    clearInterval(this.heartbeat);
    clearTimeout(this.connectTimer);
    this.ready = false;
    this.offset = 0;
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
  }
}
