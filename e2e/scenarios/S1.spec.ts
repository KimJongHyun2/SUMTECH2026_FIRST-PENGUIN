import { expect, test } from "@playwright/test"
import { useRecordedCamera } from "../helpers"

test("S1 대학생이 기준 자세를 등록하고 같은 브라우저에서 저장 상태를 확인한다", async ({ page }) => {
  await page.goto("/")
  await useRecordedCamera(page, "good")

  // 1. 첫 화면에서 '자세 등록하고 시작'을 누른다
  await page.getByRole("button", { name: "자세 등록하고 시작" }).click()

  // 2. 카메라 설정 화면에서 '카메라 켜기'를 누른다
  await page.getByRole("button", { name: "카메라 켜기" }).click()
  await expect(page.locator("#setup-camera")).toHaveText("켜짐", { timeout: 60_000 })

  // 3. 안정된 자세에서 '기준 자세 등록'을 누른다
  const clickedAt = Date.now()
  await page.getByRole("button", { name: "기준 자세 등록" }).click()
  await expect(page.locator("#setup-msg")).toHaveText("기준 자세가 등록됐어요", { timeout: 30_000 })
  const registeredAfter = Date.now() - clickedAt
  await expect(page.locator("#setup-baseline")).toHaveText(/^ID b-\S+ · 등록 /)
  const baseline = await page.locator("#setup-baseline").textContent()

  // 4. 기준 등록 완료 후 브라우저를 새로고침한다
  await page.reload()

  // expected: 연속 안정 5초 뒤 등록된 기준 ID 1개·등록 시각 유지, 상태 '준비', 카메라 꺼짐, 세션·리포트 0개,
  // 로그인 없음, 유효 감지 기록이 없어 비율은 계산 불가·'분석 가능한 기록이 없습니다', 배치 확인 필요 여부는 저장과 구분
  expect(registeredAfter).toBeGreaterThanOrEqual(5_000)
  await expect(page).toHaveURL(/\/setup$/)
  await expect(page.locator("#setup-baseline")).toHaveText(baseline!)
  await expect(page.locator("#setup-state")).toHaveText("준비")
  await expect(page.locator("#setup-camera")).toHaveText("꺼짐")
  await expect(page.locator("#setup-sessions")).toHaveText("0개")
  await expect(page.locator("#setup-reports")).toHaveText("0개")
  await expect(page.locator("#setup-analysis")).toContainText("분석 가능한 기록이 없습니다")
  await expect(page.locator("#setup-analysis")).toContainText("계산 불가")
  await expect(page.locator("#setup-placement")).toHaveText("카메라를 켜서 확인이 필요해요")
  await expect(page.getByLabel("비밀번호")).toHaveCount(0)
})
