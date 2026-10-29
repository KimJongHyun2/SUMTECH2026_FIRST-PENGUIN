import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { WebSocketServer } from 'ws';

// 폰(side.html)이 보낸 옆모습 각도를 노트북(front.html)으로 그대로 전달하는 중계.
// 외부 서비스 계정 없이 개발 서버 하나로 T3를 진행하기 위한 용도.
function sideAngleRelay() {
  return {
    name: 'side-angle-relay',
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true });
      server.httpServer?.on('upgrade', (req, socket, head) => {
        if (!req.url?.startsWith('/relay')) return; // Vite HMR 연결은 건드리지 않음
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
      });
      wss.on('connection', (ws) => {
        ws.on('message', (data) => {
          for (const client of wss.clients) {
            if (client !== ws && client.readyState === 1) client.send(data.toString());
          }
        });
      });
    },
  };
}

// 노트북 브라우저는 자기 LAN 주소를 모르므로, 폰 접속용 QR에 넣을 주소를 서버가 알려준다.
// Wi-Fi를 앞으로, VMware·WSL 같은 가상 어댑터는 뒤로 정렬한다.
function lanUrls() {
  const rank = (name) => (/wi-?fi|wlan|wireless|^en\d/i.test(name) ? 0 : /vmware|vethernet|wsl|virtual|vpn/i.test(name) ? 2 : 1);
  return {
    name: 'lan-urls',
    configureServer(server) {
      server.middlewares.use('/api/lan', (req, res) => {
        const port = server.httpServer?.address()?.port ?? 5173;
        const list = Object.entries(networkInterfaces())
          .flatMap(([name, addrs]) => (addrs ?? [])
            .filter((a) => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
            .map((a) => ({ name, url: `https://${a.address}:${port}` })))
          .sort((a, b) => rank(a.name) - rank(b.name));
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(list));
      });
    },
  };
}

export default defineConfig({
  plugins: [basicSsl(), sideAngleRelay(), lanUrls()],
  server: { host: true },
  build: {
    rollupOptions: {
      input: {
        lab: resolve(import.meta.dirname, 'lab.html'),
        front: resolve(import.meta.dirname, 'front.html'),
        side: resolve(import.meta.dirname, 'side.html'),
        angle: resolve(import.meta.dirname, 'angle.html'),
      },
    },
  },
});
