import { expect, test } from "@playwright/test"
import { fact, numberIn, ratioMatches } from "../helpers"

test("S5 대학생이 딥 모드에서 경고와 복귀 후 종료 리포트를 확인한다", async ({ page }) => {
  // 평가 전용 빌드: 정면은 녹화 영상, 측면은 테스트 휴대폰이 실제 연결 서버(/relay)를 거쳐 공급한다.
  await page.goto("/?mode=eval")

  // 1. 평가 전용 빌드의 PC 첫 화면(/?mode=eval)에서 '딥 모드 사용하기'를 누른다
  await page.getByRole("button", { name: "딥 모드 사용하기" }).click()
  await expect(page).toHaveURL(/\/connect$/)
  await expect(page.locator("#connect-qr-state")).toHaveText(/초 남음$/)

  // 2. PC 연결 화면에서 '테스트 도구'를 누른다
  await page.getByRole("button", { name: "테스트 도구" }).click()

  // 3. 테스트 도구에서 '[테스트용] 측면 데이터 주입'을 눌러 휴대폰 연결 요청과 유효 측면 입력을 시뮬레이션한다
  await page.getByRole("button", { name: "[테스트용] 측면 데이터 주입" }).click()
  await expect(page.locator("#connect-state")).toHaveText("연결 요청 있음")

  // 4. PC 연결 화면에서 '연결 승인'을 누른다
  await page.getByRole("button", { name: "연결 승인" }).click()
  await expect(page.locator("#connect-state")).toHaveText("연결됨")
  await expect(page.locator("#connect-side")).toHaveText(/^유효 · /)

  // 5. PC에서 '카메라 켜기'를 누른다
  await page.getByRole("button", { name: "카메라 켜기" }).click()
  await expect(page.locator("#connect-camera")).toHaveText("켜짐", { timeout: 60_000 })

  // 6. PC에서 '기준 자세 등록'을 누른다
  await page.getByRole("button", { name: "기준 자세 등록" }).click()
  await expect(page.locator("#connect-msg")).toHaveText("양쪽 기준 자세가 등록됐어요", { timeout: 30_000 })
  await expect(page.locator("#connect-baseline")).toHaveText(/^ID b-/)

  // 7. 양쪽 기준 등록 완료 후 PC에서 '딥 모드 탐지 시작'을 누른다
  await page.getByRole("button", { name: "딥 모드 탐지 시작" }).click()
  await expect(page.locator("#watch-state")).toHaveText("진행", { timeout: 20_000 })
  await expect(page.locator("#watch-mode")).toHaveText("딥")

  // 8. 테스트 도구에서 '[테스트용] 양쪽 이탈·복귀 재생'을 누르고 이탈 10초의 최초 경고와 이어지는 복귀 3초의 경고 해제를 기다린다
  await page.getByRole("button", { name: "[테스트용] 양쪽 이탈·복귀 재생" }).click()
  await expect(page.locator("#watch-warning")).toBeVisible({ timeout: 30_000 })
  await expect(page.locator("#test-tools-status")).toHaveText("양쪽 이탈·복귀 재생 완료", { timeout: 20_000 })
  await expect(page.locator("#watch-warning")).toBeHidden()

  // 9. PC 감지 화면에서 '세션 종료'를 누른다
  await page.getByRole("button", { name: "세션 종료" }).click()
  await expect(page.locator("#end-camera")).toHaveText("꺼짐")
  await expect(page.locator("#end-save")).toHaveText("저장 완료")
  // 측면 모의 종료 응답 (실제 휴대폰 촬영 종료 검증이 아니다)
  await expect(page.locator("#end-phone")).toHaveText("종료 요청·확인됨 (테스트 휴대폰 모의 응답)")

  // 10. PC 종료 화면에서 '리포트 보기'를 누른다
  await page.getByRole("button", { name: "리포트 보기" }).click()

  // expected: 테스트 표시가 있는 딥 종료 리포트 1개, 확정 이탈·최초 경고·정상 복귀 각 1회, 재경고·자동 리포트 각 0개
  await expect(page.locator("#report-summary")).toContainText("자동 리포트 0개 · 종료 리포트 1개")
  const report = page.locator(".report-card")
  await expect(report).toHaveCount(1)
  await expect(report.getByRole("heading")).toContainText("종료 리포트 · 딥 모드")
  await expect(report.locator(".badge")).toContainText("측면 모의 입력")
  await expect(fact(report, "확정 이탈")).toHaveText("1회")
  await expect(fact(report, "최초 경고")).toHaveText("1회")
  await expect(fact(report, "재경고")).toHaveText("0회")
  await expect(fact(report, "정상 복귀")).toHaveText("1회")

  // 비율은 중복 없는 실제 딥 D/V*100(%). 명목 D는 13초이며 영상 입력 반영 지연을 PRD 7절에 따라 허용한다.
  const D = await numberIn(fact(report, "이탈 시간"))
  const V = await numberIn(fact(report, "유효 감지 시간"))
  const ratio = await numberIn(fact(report, "이탈 비율"))
  expect(D).toBeGreaterThanOrEqual(13)
  expect(D).toBeLessThanOrEqual(16)
  expect(ratioMatches(D, V, ratio)).toBe(true)
  await expect(fact(report, "딥 모드")).toHaveText(`유효 ${V}초 · 이탈 ${D}초 · 비율 ${ratio}%`)
})
