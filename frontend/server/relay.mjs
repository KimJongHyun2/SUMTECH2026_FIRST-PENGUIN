import { WebSocketServer } from "ws";
import { CONNECTION_PILOT } from "../../posture-web/src/core/policy.js";
// 브라우저가 승인한 한 휴대폰만 연결한다. 영상·랜드마크·세션 기록은 보관하지 않는다.
// QR은 발급 후 120초 미만이고 아직 쓰이지 않았을 때만 요청·승인할 수 있다. 승인된 연결은 만료로 끊지 않는다.
const QR_MS = CONNECTION_PILOT.qrExpirySeconds * 1000;
export function attachRelay(server, now = () => Date.now()) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  const rooms = new Map();
  const send = (ws, message) => {
    if (ws?.readyState === 1) ws.send(JSON.stringify(message));
  };
  server.on("upgrade", (req, socket, head) => {
    if (new URL(req.url, "http://localhost").pathname !== "/relay") return;
    let origin;
    try {
      origin = new URL(req.headers.origin).host;
    } catch {
      socket.destroy();
      return;
    }
    if (origin !== req.headers.host) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });
  wss.on("connection", (ws) => {
    let room, role, key;
    ws.on("message", (bytes) => {
      let message;
      try {
        message = JSON.parse(bytes.toString());
      } catch {
        return;
      }
      if (!room) {
        if (!/^[a-f0-9-]{36}$/.test(message.token ?? "")) return ws.close();
        key = message.token;
        const target = rooms.get(key);
        if (message.type === "host" && !target) {
          role = "host";
          room = {
            host: ws,
            phone: null,
            approved: false,
            used: false,
            issuedAt: now(),
          };
          rooms.set(key, room);
          send(ws, { type: "ready" });
        } else if (message.type === "join" && target?.used) {
          send(ws, { type: "used" });
          ws.close();
        } else if (
          message.type === "join" &&
          target &&
          now() - target.issuedAt >= QR_MS
        ) {
          send(ws, { type: "expired" });
          send(target.host, { type: "expired" });
          ws.close();
        } else if (message.type === "join" && target) {
          role = "phone";
          room = target;
          room.phone = ws;
          room.used = true;
          send(room.host, { type: "request" });
          send(ws, { type: "waiting" });
        } else {
          send(ws, { type: "unavailable" });
          ws.close();
        }
        return;
      }
      if (
        role === "host" &&
        message.type === "approve" &&
        room.phone &&
        !room.approved
      ) {
        if (now() - room.issuedAt >= QR_MS) {
          const phone = room.phone;
          room.phone = null;
          send(phone, { type: "expired" });
          send(ws, { type: "expired" });
          phone.close();
          return;
        }
        room.approved = true;
        send(room.phone, { type: "approved" });
        send(ws, { type: "approved" });
      }
      if (role === "phone" && room.approved && message.type === "sample") {
        const valid =
          message.quality === "valid" &&
          Number.isFinite(message.angle) &&
          message.angle >= 0 &&
          message.angle <= 180;
        send(room.host, {
          type: "sample",
          quality: valid ? "valid" : "unrecognized",
          angle: valid ? message.angle : null,
        });
      }
      if (role === "host" && ["stop", "ping"].includes(message.type))
        send(room.phone, { type: message.type });
      if (role === "phone" && room.approved && message.type === "stopped")
        send(room.host, { type: "stopped" });
    });
    ws.on("close", () => {
      if (!room) return;
      if (role === "host") {
        rooms.delete(key);
        send(room.phone, { type: "stop" });
        room.phone?.close();
      } else if (room.phone === ws) {
        room.phone = null;
        room.approved = false;
        send(room.host, { type: "disconnected" });
      }
    });
  });
  server.on("close", () => {
    for (const ws of wss.clients) ws.terminate();
    wss.close();
  });
  return wss;
}
