export type ConnectionMessage = {
  type: string;
  quality?: string;
  angle?: number | null;
};
export class PairingService {
  private socket?: WebSocket;
  private heartbeat?: ReturnType<typeof setInterval>;
  private watchdog?: ReturnType<typeof setInterval>;
  private lastPing = 0;
  constructor(private receive: (message: ConnectionMessage) => void) {}
  open(role: "host" | "phone", token: string) {
    this.close();
    const ws = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/relay`,
    );
    this.socket = ws;
    ws.onopen = () =>
      this.send({ type: role === "host" ? "host" : "join", token });
    ws.onmessage = (event) => {
      if (this.socket !== ws) return;
      const message: ConnectionMessage = JSON.parse(event.data);
      if (message.type === "ping") this.lastPing = Date.now();
      if (message.type === "approved") {
        if (role === "host")
          this.heartbeat = setInterval(() => this.send({ type: "ping" }), 750);
        else {
          this.lastPing = Date.now();
          this.watchdog = setInterval(() => {
            if (Date.now() - this.lastPing > 4000) {
              this.close();
              this.receive({ type: "disconnected" });
            }
          }, 500);
        }
      }
      this.receive(message);
    };
    ws.onerror = () => {
      if (this.socket === ws) this.receive({ type: "error" });
    };
    ws.onclose = () => {
      if (this.socket === ws) {
        this.close();
        this.receive({ type: "disconnected" });
      }
    };
  }
  send(message: Record<string, unknown>) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(message));
  }
  close() {
    clearInterval(this.heartbeat);
    clearInterval(this.watchdog);
    const ws = this.socket;
    this.socket = undefined;
    ws?.close();
  }
}
