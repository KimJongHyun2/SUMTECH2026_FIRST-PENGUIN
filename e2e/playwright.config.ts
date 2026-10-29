import { defineConfig } from "@playwright/test"
import { E2E_BASE_URL } from "./env"

/**
 * 로컬·CI용 설정이다. docker compose up 뒤 `npx playwright test`로 주최 측 실행과 같은 조건을 미리 확인한다.
 * 주최 측 실행은 이 파일을 쓰지 않고 같은 값의 자체 설정으로 실행한다. 여기에만 둔 설정에 기대지 않는다.
 */
export default defineConfig({
  testDir: "./scenarios",
  // docs/scenarios.yaml의 id와 같은 이름(S1.spec.ts…)만 실행한다.
  testMatch: /[\\/]S[1-9]\d*\.spec\.ts$/,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: E2E_BASE_URL,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  // docs/scenarios.yaml의 platform: desktop
  projects: [{ name: "desktop", use: { viewport: { width: 1440, height: 900 } } }],
})
