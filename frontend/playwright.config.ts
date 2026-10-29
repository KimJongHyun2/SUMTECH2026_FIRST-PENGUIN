import { defineConfig } from "@playwright/test";
// 5173을 이미 쓰고 있으면 UI_PORT로 다른 포트를 지정한다.
const port = Number(process.env.UI_PORT ?? 5173);
export default defineConfig({
  testDir: "./tests/ui",
  timeout: 45000,
  use: {
    baseURL: `http://localhost:${port}`,
    channel: "chrome",
    headless: true,
  },
  // 평가 빌드로 띄운다. 평가 모드는 첫 주소가 /?mode=eval일 때만 켜지므로 다른 시험에는 영향이 없다.
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    env: { EVAL_ENABLED: "true" },
  },
});
