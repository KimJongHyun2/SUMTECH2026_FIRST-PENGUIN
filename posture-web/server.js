// 운영 서버: 빌드 결과(dist) 제공, /__health, 없는 주소 404.
// docker-compose.yml의 app이 이 파일로 0.0.0.0:3000에서 받는다.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { APP_ROUTES } from './shared/routes.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const isFile = async (path) => {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};

function send(req, res, status, headers, body) {
  res.writeHead(status, { 'Content-Length': Buffer.byteLength(body), ...headers });
  res.end(req.method === 'HEAD' ? undefined : body);
}

async function sendFile(req, res, status, file, cacheControl) {
  const body = await readFile(file);
  send(req, res, status, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': cacheControl,
  }, body);
}

export function createAppServer({ distDir, releaseId }) {
  const root = resolve(distDir);
  const page = (name) => join(root, name);

  return createServer(async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        send(req, res, 405, { Allow: 'GET, HEAD' }, '');
        return;
      }
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

      if (path === '/__health') {
        send(req, res, 200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        }, JSON.stringify({ releaseId }));
        return;
      }
      if (path === '/' || APP_ROUTES.includes(path)) {
        await sendFile(req, res, 200, page('index.html'), 'no-cache');
        return;
      }
      const file = resolve(root, `.${path}`);
      if (file.startsWith(root + sep) && await isFile(file)) {
        // 빌드 산출물(assets/)은 파일 이름에 해시가 붙어 오래 캐시해도 된다.
        const cache = path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
        await sendFile(req, res, 200, file, cache);
        return;
      }
      await sendFile(req, res, 404, page('404.html'), 'no-cache');
    } catch (error) {
      console.error(error);
      if (!res.headersSent) send(req, res, 500, { 'Content-Type': 'text/plain; charset=utf-8' }, '서버 오류');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const distDir = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
  const port = Number(process.env.PORT ?? 3000);
  const releaseId = process.env.RELEASE_ID || 'dev';
  createAppServer({ distDir, releaseId }).listen(port, '0.0.0.0', () => {
    console.log(`패스트거북이 서버 0.0.0.0:${port} releaseId=${releaseId}`);
  });
}
