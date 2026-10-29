// HTTP 서버에 딥 모드 WebSocket 중계를 붙인다. 연결 정책은 브라우저 폴백과 공유한다.
import { WebSocketServer } from 'ws';
import { MAX_RTC_MESSAGE_BYTES } from './deep-protocol.js';
import { ConnectionHub } from './connection-hub.js';
export { ConnectionHub } from './connection-hub.js';

const SWEEP_MS = 500;

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
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_RTC_MESSAGE_BYTES * 2 });
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
