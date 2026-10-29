// 딥 모드 중계 (F8·F10). PC와 휴대폰이 같은 연결 방(QR의 room)으로 들어오면 서로의 메시지를 그대로 전달한다.
// 승인·만료·판정은 PC가 하고, 서버는 기록을 보관하지 않는다 (docs/prd.md 4절 "휴대폰·중계에 개인 기록 이력을 보관하지 않는다").
import { WebSocketServer } from 'ws';

const ROOM_PATTERN = /^[a-z0-9-]{8,64}$/;

export function attachRelay(httpServer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const rooms = new Map(); // room → Set<ws>

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/relay') return; // 개발 서버의 HMR 연결은 건드리지 않는다
    const room = url.searchParams.get('room') ?? '';
    const role = url.searchParams.get('role');
    if (!ROOM_PATTERN.test(room) || (role !== 'pc' && role !== 'phone')) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.role = role;
      if (!rooms.has(room)) rooms.set(room, new Set());
      rooms.get(room).add(ws);
      ws.on('message', (data) => {
        for (const peer of rooms.get(room) ?? []) {
          if (peer.role !== role && peer.readyState === 1) peer.send(data.toString());
        }
      });
      ws.on('close', () => {
        const peers = rooms.get(room);
        peers?.delete(ws);
        if (!peers?.size) rooms.delete(room);
      });
    });
  });
  return wss;
}
