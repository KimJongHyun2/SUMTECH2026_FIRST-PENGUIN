import { expect, test } from "@playwright/test"
import { fact } from "../helpers"

test("S3 대학생이 테스트에서 3초로 가속된 자동 리포트를 보고 같은 세션의 작업을 계속한다", async ({ page }) => {
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

  // 4. 기준 등록 완료 후 '테스트 도구'를 누른다
  await page.getByRole("button", { name: "테스트 도구" }).click()

  // 5. 테스트 도구에서 '[테스트용] 리포트 3초 가속'을 누른다
  await page.getByRole("button", { name: "[테스트용] 리포트 3초 가속" }).click()
  await expect(page.locator("#test-tools-status")).toContainText("첫 자동 리포트를 유효 3초에 만들어요")

  // 6. 감지 준비 화면에서 '탐지 시작'을 누르고 기준 범위 입력으로 유효 3초 처리 완료를 기다린다
  await page.getByRole("button", { name: "탐지 시작" }).click()
  await expect(page.locator("#watch-state")).toHaveText("진행", { timeout: 20_000 })
  const sessionId = await page.locator("#watch-session").textContent()
  // 문구는 숨겨진 채 늘 있으므로 화면에 나타났는지를 확인한다.
  await expect(page.getByText("리포트가 준비됐어요")).toBeVisible({ timeout: 20_000 })

  // 7. 감지 화면에서 '리포트 보기'를 누른다
  await page.getByRole("button", { name: "리포트 보기" }).click()

  // expected: 자동 리포트 1개, 첫 구간 V=3초·D=0초·비율 0%, 이탈·경고·복귀·종료 리포트 각 0개, 테스트 표시
  await expect(page.locator("#report-summary")).toContainText(`세션 ID ${sessionId}`)
  await expect(page.locator("#report-summary")).toContainText("자동 리포트 1개 · 종료 리포트 0개")
  const report = page.locator(".report-card")
  await expect(report).toHaveCount(1)
  await expect(report.getByRole("heading")).toContainText("자동 리포트 1")
  await expect(report.locator(".badge")).toContainText("테스트 기록")
  await expect(report.locator(".badge")).toContainText("리포트 3초 가속")
  await expect(fact(report, "유효 감지 시간")).toHaveText("3초")
  await expect(fact(report, "이탈 시간")).toHaveText("0초")
  await expect(fact(report, "이탈 비율")).toHaveText("0%")
  await expect(fact(report, "확정 이탈")).toHaveText("0회")
  await expect(fact(report, "최초 경고")).toHaveText("0회")
  await expect(fact(report, "재경고")).toHaveText("0회")
  await expect(fact(report, "정상 복귀")).toHaveText("0회")

  // 8. 리포트 화면에서 '닫기'를 누른다
  await page.getByRole("button", { name: "닫기" }).click()

  // expected: 같은 세션이 계속되며 첫 주기 가속은 해제되고 다음 자동 주기는 1800초
  await expect(page).toHaveURL(/\/watch$/)
  await expect(page.locator("#watch-session")).toHaveText(sessionId!)
  await expect(page.locator("#watch-state")).toHaveText("진행")
  await expect(page.locator("#watch-next-report")).toHaveText(/^유효 30:03 \(주기 1800초\)$/)
})
