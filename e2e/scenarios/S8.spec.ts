import { expect, test } from "@playwright/test"

test("S8 대학생이 잘못된 경고 시간을 거부받고 기준을 재등록해 탐지를 재개한다", async ({ page }) => {
  // 평가 전용 빌드: '카메라 켜기'가 e2e/fixtures/test-pose.webm의 녹화 구간을 공통 판정 경로로 공급한다.
  await page.goto("/?mode=eval")

  // 1. 평가 전용 빌드의 첫 화면(/?mode=eval)에서 '자세 등록하고 시작'을 누른다
  await page.getByRole("button", { name: "자세 등록하고 시작" }).click()

  // 2. 카메라 설정 화면에서 '카메라 켜기'를 누른다
  await page.getByRole("button", { name: "카메라 켜기" }).click()
  await expect(page.locator("#setup-camera")).toHaveText("켜짐", { timeout: 60_000 })

  // 3. 안정된 자세에서 '기준 자세 등록'을 누른다
  await page.getByRole("button", { name: "기준 자세 등록" }).click()
  await expect(page.locator("#setup-msg")).toHaveText("기준 자세가 등록됐어요", { timeout: 30_000 })

  // 4. 기준 등록 완료 후 '탐지 시작'을 누른다
  await page.getByRole("button", { name: "탐지 시작" }).click()
  await expect(page.locator("#watch-state")).toHaveText("진행", { timeout: 20_000 })
  const sessionId = await page.locator("#watch-session").textContent()
  const firstBaseline = await page.locator("#watch-baseline").textContent()
  const settings = page.locator("#watch-settings-version")
  await expect(settings).toHaveText(/^c-\S+ · 경고 10초 · 재경고 60초$/)
  const settingsBefore = await settings.textContent()

  // 5. 감지 화면에서 '설정'을 누른다
  await page.getByRole("button", { name: "설정", exact: true }).click()
  await expect(page.getByLabel("경고 시간")).toHaveValue("10")

  // 6. 경고 시간 입력란에 0을 입력한다
  await page.getByLabel("경고 시간").fill("0")

  // 7. 설정 화면에서 '적용'을 누른다
  await page.getByRole("button", { name: "적용" }).click()
  // 0초는 '양의 정수를 입력해 주세요'로 거부하고 기존 설정을 유지한다.
  await expect(page.locator("#settings-warning-error")).toHaveText("양의 정수를 입력해 주세요")
  await expect(page.locator("#settings-panel")).toBeVisible()
  await expect(settings).toHaveText(settingsBefore!)

  // 8. 경고 시간 입력란에 10을 입력한다
  await page.getByLabel("경고 시간").fill("10")

  // 9. 설정 화면에서 '적용'을 누른다
  await page.getByRole("button", { name: "적용" }).click()
  // 기존과 같은 10초는 오류만 해제하고 기존 경고 10초·재경고 60초·설정 버전·측정 구간을 유지한다.
  await expect(page.locator("#settings-panel")).toBeHidden()
  await expect(page.locator("#settings-warning-error")).toHaveText("")
  await expect(page.locator("#watch-msg")).toHaveText("바뀐 설정이 없어 기존 설정을 그대로 써요")
  await expect(settings).toHaveText(settingsBefore!)
  await expect(page.locator("#watch-state")).toHaveText("진행")

  // 10. 감지 화면에서 '기준 다시 등록'을 누른다
  await page.getByRole("button", { name: "기준 다시 등록" }).click()
  await expect(page.locator("#watch-state")).toHaveText("준비")

  // 11. 안정된 자세에서 '기준 자세 등록'을 누른다
  await page.getByRole("button", { name: "기준 자세 등록" }).click()
  await expect(page.locator("#rebaseline-msg")).toHaveText("기준 자세가 등록됐어요", { timeout: 30_000 })
  // 새 기준이 등록돼도 '탐지 재개' 전에는 자동으로 재개하지 않는다.
  await expect(page.locator("#watch-state")).toHaveText("준비")

  // 12. 새 기준 등록 완료 후 '탐지 재개'를 누른다
  await page.getByRole("button", { name: "탐지 재개" }).click()

  // expected: 새 기준 ID로 같은 세션의 새 기준 구간에서 진행, 이탈·경고·복귀 각 0회
  await expect(page.locator("#watch-state")).toHaveText("진행", { timeout: 20_000 })
  await expect(page.locator("#watch-session")).toHaveText(sessionId!)
  await expect(page.locator("#watch-baseline")).toHaveText(/^b-/)
  await expect(page.locator("#watch-baseline")).not.toHaveText(firstBaseline!)
  await expect(settings).toHaveText(settingsBefore!)
  await expect(page.locator("#watch-warning")).toBeHidden()
  await expect(page.locator("#watch-candidate")).toHaveText("-")
})
