import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [basicSsl()],
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
