// HTTP 서버에 딥 모드 WebSocket 중계를 붙인다. 연결 정책은 브라우저 폴백과 공유한다.
import { WebSocketServer } from 'ws';
import { MAX_MESSAGE_BYTES } from './deep-protocol.js';
import { ConnectionHub } from './connection-hub.js';
export { ConnectionHub } from './connection-hub.js';

const SWEEP_MS = 500;

/**
 * HTTP 서버에 /relay WebSocket을 붙인다. role=pc|phone. 다른 사이트에서 연 페이지의 연결은 받지 않는다.
 * @returns {{ hub: ConnectionHub, close(): void }}
 */
export function attachRelay(httpServer, { hub = new ConnectionHub() } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES * 2 });
  const timer = setInterval(() => hub.sweep(), SWEEP_MS);
  timer.unref?.();

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/relay') return; // 개발 서버의 HMR 연결은 건드리지 않는다
    const role = url.searchParams.get('role');
    const origin = req.headers.origin;
    const sameSite = !origin || new URL(origin).host === req.headers.host;
    if ((role !== 'pc' && role !== 'phone') || !sameSite) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const client = hub.connect({
        send: (message) => { if (ws.readyState === 1) ws.send(JSON.stringify(message)); },
        close: (code, reason) => ws.close(code, reason),
      }, role);
      ws.on('message', (data, isBinary) => hub.receive(client, isBinary ? null : data.toString()));
      ws.on('close', () => hub.disconnect(client, 'closed'));
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
