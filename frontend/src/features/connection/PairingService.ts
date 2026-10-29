// 딥 모드 연결 클라이언트. 메시지 형식·시간 값은 백엔드 중계와 같은 posture-web/shared/deep-protocol.js를 따른다.
// 서버는 요청·승인·전달·유실·종료 확인만 다루고, 판정·세션·기록은 PC 브라우저가 한다.
export type RelayMessage = { type: string } & Record<string, unknown>;
const defaultBase = () =>
  `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`;
export class PairingService {
  private socket?: WebSocket;
  private heartbeat?: ReturnType<typeof setInterval>;
  /** 서버 시각 − 이 기기 시각(ms). hello·pong의 serverTime으로 맞춘다. */
  private offset = 0;
  constructor(
    private receive: (message: RelayMessage) => void,
    private base = defaultBase,
  ) {}
  get open() {
    return this.socket?.readyState === WebSocket.OPEN;
  }
  /** hello를 받으면 onReady를 부르고, 응답 끊김 판정을 피하도록 heartbeat마다 ping을 보낸다. */
  connect(role: "pc" | "phone", onReady: () => void) {
    this.close();
    const ws = new WebSocket(`${this.base()}/relay?role=${role}`);
    this.socket = ws;
    ws.onmessage = (event) => {
      if (this.socket !== ws) return;
      let message: RelayMessage;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (typeof message.serverTime === "number")
        this.offset = message.serverTime - Date.now();
      if (message.type === "hello") {
        const every = Number(message.heartbeatMs) || 2000;
        this.heartbeat = setInterval(() => this.send({ type: "ping" }), every);
        onReady();
      }
      if (message.type !== "pong") this.receive(message);
    };
    ws.onerror = () => {
      if (this.socket === ws) this.receive({ type: "socket.error" });
    };
    ws.onclose = () => {
      if (this.socket !== ws) return;
      this.close();
      this.receive({ type: "socket.closed" });
    };
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
    const ws = this.socket;
    this.socket = undefined;
    ws?.close();
  }
}
