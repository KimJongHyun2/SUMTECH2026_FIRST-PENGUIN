import { expect, test } from "@playwright/test"
import { fact, numberIn } from "../helpers"

test("S5 대학생이 딥 모드에서 경고와 복귀 후 종료 리포트를 확인한다", async ({ page }) => {
  // 1. 평가 전용 빌드의 PC 첫 화면(/?mode=eval)에서 '딥 모드 사용하기'를 누른다
  await page.goto("/?mode=eval")
  await page.getByRole("button", { name: "딥 모드 사용하기" }).click()

  // 2. PC 연결 화면에서 '테스트 도구'를 누른다
  await page.getByRole("button", { name: "테스트 도구" }).click()
  // QR은 분석 모델을 먼저 불러온 뒤 만든다(모델 첫 로딩이 연결 heartbeat를 막지 않게).
  await expect(page.locator("#connect-qr-box")).toBeVisible({ timeout: 60_000 })

  // 3. '[테스트용] 측면 데이터 주입'으로 휴대폰 연결 요청과 유효 측면 입력을 시뮬레이션한다
  await page.getByRole("button", { name: "[테스트용] 측면 데이터 주입" }).click()

  // 4. PC 연결 화면에서 '연결 승인'을 누른다
  await page.getByRole("button", { name: "연결 승인" }).click()
  await expect(page.locator("#connect-state")).toHaveText("연결됨")
  await expect(page.locator("#connect-side")).toHaveText("유효")

  // 5. PC에서 '카메라 켜기'를 누른다
  await page.getByRole("button", { name: "카메라 켜기" }).click()

  // 6. PC에서 '기준 자세 등록'을 누른다
  await page.getByRole("button", { name: "기준 자세 등록" }).click()
  await expect(page.locator("#connect-reg-msg")).toHaveText("정면·측면 양쪽 기준이 등록됐어요", { timeout: 60_000 })
  await expect(page.locator("#connect-baseline")).toHaveText(/^ID b-/)

  // 7. 양쪽 기준 등록 완료 후 PC에서 '딥 모드 탐지 시작'을 누른다
  await page.getByRole("button", { name: "딥 모드 탐지 시작" }).click()
  await expect(page).toHaveURL(/\/watch$/)
  await expect(page.locator("#watch-mode")).toHaveText("딥")

  // 8. '[테스트용] 양쪽 이탈·복귀 재생'으로 최초 경고와 복귀 3초의 경고 해제를 기다린다
  await page.getByRole("button", { name: "[테스트용] 양쪽 이탈·복귀 재생" }).click()
  await expect(page.locator("#test-tools-status")).toHaveText("양쪽 이탈·복귀 재생 완료", { timeout: 60_000 })
  await expect(page.locator("#watch-warning")).toBeHidden()

  // 9. PC 감지 화면에서 '세션 종료'를 누른다
  await page.getByRole("button", { name: "세션 종료" }).click()
  await expect(page.locator("#end-save")).toHaveText("저장 완료")
  await expect(page.locator("#end-camera")).toHaveText("꺼짐")
  await expect(page.locator("#end-phone")).toHaveText("촬영 종료 확인됨 · 측면 모의 응답")

  // 10. PC 종료 화면에서 '리포트 보기'를 누른다
  await page.getByRole("button", { name: "리포트 보기" }).click()
  await expect(page.locator("#report-summary")).toContainText("자동 리포트 0개 · 종료 리포트 1개")
  const card = page.locator(".report-card")
  await expect(card).toHaveCount(1)
  await expect(card.locator(".badge")).toContainText("측면 모의 입력")
  await expect(fact(card, "확정 이탈")).toHaveText("1회")
  await expect(fact(card, "최초 경고")).toHaveText("1회")
  await expect(fact(card, "정상 복귀")).toHaveText("1회")
  await expect(fact(card, "재경고")).toHaveText("0회")
  // 화면의 초·%는 반올림 값이다. 유효 시간이 짧으면 ±0.5초만으로 D/V가 수 %p 달라지므로
  // 표시된 초가 나타내는 범위에서 가능한 비율 구간(표시 % 반올림 0.5%p 포함) 안에 있는지 본다.
  const valid = await numberIn(fact(card, "유효 감지 시간"))
  const deviation = await numberIn(fact(card, "이탈 시간"))
  expect(deviation).toBeGreaterThanOrEqual(10)
  const ratio = await numberIn(fact(card, "이탈 비율"))
  const lowest = ((deviation - 0.5) / (valid + 0.5)) * 100 - 0.5
  const highest = Math.min(100, ((deviation + 0.5) / Math.max(valid - 0.5, deviation - 0.5)) * 100) + 0.5
  expect(ratio).toBeGreaterThanOrEqual(lowest)
  expect(ratio).toBeLessThanOrEqual(highest)
  await expect(fact(card, "딥 모드")).toContainText("유효")
  await expect(page.locator("#report-session")).toContainText("휴대폰 촬영 종료: 촬영 종료 확인됨 · 측면 모의 응답")
})
