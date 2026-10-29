import { copyFileSync, createReadStream, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { attachRelay } from './shared/relay.js';

// 평가 전용 빌드 (docs/prd.md 7절). EVAL_ENABLED=true로 빌드할 때만 평가 입력 영상을 /eval/에 넣는다.
// 일반 빌드(배포 사이트)에는 평가 입력·테스트 도구가 들어가지 않는다.
const EVAL_ENABLED = process.env.EVAL_ENABLED === 'true';
const EVAL_FILES = ['test-pose.webm', 'test-pose.manifest.json'];
const FIXTURES = resolve(import.meta.dirname, '../e2e/fixtures');

function evalInput() {
  return {
    name: 'eval-input',
    configureServer(server) {
      if (!EVAL_ENABLED) return;
      server.middlewares.use('/eval', (req, res, next) => {
        const name = req.url.split('?')[0].slice(1);
        if (!EVAL_FILES.includes(name)) return next();
        res.setHeader('Content-Type', name.endsWith('.json') ? 'application/json' : 'video/webm');
        createReadStream(resolve(FIXTURES, name)).pipe(res);
      });
    },
    closeBundle() {
      if (!EVAL_ENABLED) return;
      const out = resolve(import.meta.dirname, 'dist/eval');
      mkdirSync(out, { recursive: true });
      for (const name of EVAL_FILES) {
        // 없으면 앱이 '평가 입력을 불러올 수 없어요'로 막는다. 빌드는 실패시키지 않는다.
        if (existsSync(resolve(FIXTURES, name))) copyFileSync(resolve(FIXTURES, name), resolve(out, name));
      }
    },
  };
}

// 개발 서버(https)에서도 딥 모드 휴대폰 연결을 시험할 수 있게 운영 서버와 같은 중계를 붙인다.
function deepRelay() {
  return {
    name: 'deep-relay',
    configureServer(server) {
      if (server.httpServer) attachRelay(server.httpServer);
    },
  };
}

export default defineConfig({
  plugins: [basicSsl(), evalInput(), deepRelay()],
  define: { __EVAL_ENABLED__: JSON.stringify(EVAL_ENABLED) },
  server: { host: true },
  // 배포에는 서비스 화면과 404 페이지만 넣는다. 실험 도구는 archive/posture-experiments로 옮겼다.
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        notFound: resolve(import.meta.dirname, '404.html'),
      },
    },
  },
});
