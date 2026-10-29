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
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
  },
});
