import { expect, test } from "@playwright/test"
import { fact, numberIn, ratioMatches } from "../helpers"

const WARNING = "기준 자세에서 벗어난 상태가 지속되고 있습니다. 자세를 확인해 주세요."

test("S2 대학생이 10초 기준 이탈 경고를 받고 3초 복귀 후 종료 리포트를 확인한다", async ({ page }) => {
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

  // 5. 감지 화면에서 '테스트 도구'를 누른다
  await page.getByRole("button", { name: "테스트 도구" }).click()

  // 6. '[테스트용] 정면 이탈·복귀 재생'을 눌러 녹화 입력의 이탈 10초와 복귀 3초 연속 재생 완료를 기다린다
  await page.getByRole("button", { name: "[테스트용] 정면 이탈·복귀 재생" }).click()
  await expect(page.locator("#watch-warning")).toHaveText(WARNING, { timeout: 30_000 })
  await expect(page.locator("#test-tools-status")).toHaveText("정면 이탈·복귀 재생 완료", { timeout: 20_000 })
  await expect(page.locator("#watch-warning")).toBeHidden()

  // 7. 감지 화면에서 '세션 종료'를 누른다
  await page.getByRole("button", { name: "세션 종료" }).click()
  await expect(page.locator("#end-state")).toHaveText("종료")
  await expect(page.locator("#end-camera")).toHaveText("꺼짐")
  await expect(page.locator("#end-save")).toHaveText("저장 완료")

  // 8. 종료 화면에서 '리포트 보기'를 누른다
  await page.getByRole("button", { name: "리포트 보기" }).click()

  // expected: 종료 리포트 1개·자동 리포트 0개, 확정 이탈·최초 경고·정상 복귀 각 1회·재경고 0회
  await expect(page.locator("#report-summary")).toContainText("자동 리포트 0개 · 종료 리포트 1개")
  const report = page.locator(".report-card")
  await expect(report).toHaveCount(1)
  await expect(report.getByRole("heading")).toContainText("종료 리포트")
  await expect(fact(report, "확정 이탈")).toHaveText("1회")
  await expect(fact(report, "최초 경고")).toHaveText("1회")
  await expect(fact(report, "재경고")).toHaveText("0회")
  await expect(fact(report, "정상 복귀")).toHaveText("1회")

  // 리포트의 비율은 실제 D/V*100(%)와 일치한다. 명목 D는 13초(이탈 10초 + 복귀 확인 3초)이며
  // 영상 입력은 400ms 처리·최근 3개 평균만큼 자세 변화가 늦게 반영될 수 있다(PRD 7절).
  const D = await numberIn(fact(report, "이탈 시간"))
  const V = await numberIn(fact(report, "유효 감지 시간"))
  const ratio = await numberIn(fact(report, "이탈 비율"))
  expect(D).toBeGreaterThanOrEqual(13)
  expect(D).toBeLessThanOrEqual(16)
  expect(V).toBeGreaterThanOrEqual(D)
  expect(ratioMatches(D, V, ratio)).toBe(true)
})
