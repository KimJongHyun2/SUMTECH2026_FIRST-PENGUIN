import { expect, test } from "@playwright/test"
import { fact, numberIn, ratioMatches } from "../helpers"

test("S4 대학생이 자리 비움으로 시간 연속성이 끊긴 뒤 새 이탈 경고를 확인한다", async ({ page }) => {
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

  // 5. 감지 화면에서 '테스트 도구'를 누른다
  await page.getByRole("button", { name: "테스트 도구" }).click()

  // 6. '[테스트용] 자리 비움·재이탈 재생'을 눌러 이탈 6초→자리 비움 5초→새 이탈 10초→복귀 3초의 녹화 입력 연속 재생 완료를 기다린다
  await page.getByRole("button", { name: "[테스트용] 자리 비움·재이탈 재생" }).click()
  // 자리 비움 중에는 판정 보류이며, 앞의 이탈 6초와 뒤의 이탈을 합쳐 경고하지 않는다.
  await expect(page.locator("#watch-recognition")).toHaveText("자리 비움 · 판정 보류", { timeout: 30_000 })
  await expect(page.locator("#watch-warning")).toBeHidden()
  await expect(page.locator("#test-tools-status")).toHaveText("자리 비움·재이탈 재생 중: 새 이탈 10초", { timeout: 20_000 })
  await expect(page.locator("#watch-warning")).toBeVisible({ timeout: 30_000 })
  await expect(page.locator("#test-tools-status")).toHaveText("자리 비움·재이탈 재생 완료", { timeout: 20_000 })

  // 7. 감지 화면에서 '일시 정지'를 누른다
  await page.getByRole("button", { name: "일시 정지" }).click()
  await expect(page.locator("#watch-state")).toHaveText("사용자 정지")
  await expect(page.locator("#watch-msg")).toContainText("촬영이 꺼졌어요")

  // 8. 정지 상태에서 '재개'를 누른다
  await page.getByRole("button", { name: "재개", exact: true }).click()

  // 9. 기준·배치 확인 후 감지 화면에서 '세션 종료'를 누른다
  await expect(page.locator("#watch-state")).toHaveText("진행", { timeout: 20_000 })
  await expect(page.locator("#watch-session")).toHaveText(sessionId!)
  await page.getByRole("button", { name: "세션 종료" }).click()
  await expect(page.locator("#end-camera")).toHaveText("꺼짐")
  await expect(page.locator("#end-save")).toHaveText("저장 완료")

  // 10. 종료 화면에서 '리포트 보기'를 누른다
  await page.getByRole("button", { name: "리포트 보기" }).click()

  // expected: 종료 리포트 1개에 확정 이탈·최초 경고·정상 복귀 각 1회·재경고 0회와 자리 비움 보류 사유, 같은 세션 ID
  await expect(page.locator("#report-summary")).toContainText(`세션 ID ${sessionId}`)
  await expect(page.locator("#report-summary")).toContainText("자동 리포트 0개 · 종료 리포트 1개")
  const report = page.locator(".report-card")
  await expect(report).toHaveCount(1)
  await expect(fact(report, "확정 이탈")).toHaveText("1회")
  await expect(fact(report, "최초 경고")).toHaveText("1회")
  await expect(fact(report, "재경고")).toHaveText("0회")
  await expect(fact(report, "정상 복귀")).toHaveText("1회")
  await expect(fact(report, "판정 보류")).toContainText("자리 비움 · 판정 보류")
  await expect(page.locator("#report-session")).toContainText("일시 정지 1회")

  // 첫 후보 6초는 V에만 포함하고 자리 비움·정지·준비는 V에서 뺀다. 비율은 실제 D/V*100(%).
  // 명목 D는 13초(새 이탈 10초 + 복귀 확인 3초)이며 영상 입력 반영 지연을 PRD 7절에 따라 허용한다.
  const D = await numberIn(fact(report, "이탈 시간"))
  const V = await numberIn(fact(report, "유효 감지 시간"))
  const ratio = await numberIn(fact(report, "이탈 비율"))
  expect(D).toBeGreaterThanOrEqual(13)
  expect(D).toBeLessThanOrEqual(16)
  expect(V).toBeGreaterThanOrEqual(D + 6)
  expect(ratioMatches(D, V, ratio)).toBe(true)
})
