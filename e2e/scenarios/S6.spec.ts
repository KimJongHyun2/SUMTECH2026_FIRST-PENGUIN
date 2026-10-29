import { expect, test } from "@playwright/test"
import { fact, numberIn } from "../helpers"

test("S6 대학생이 딥 모드 장애 시 판정 보류 후 기본 모드로 안전 전환한다", async ({ page }) => {
  // 1~2. 평가 전용 빌드의 PC 첫 화면에서 '딥 모드 사용하기' → '테스트 도구'
  await page.goto("/?mode=eval")
  await page.getByRole("button", { name: "딥 모드 사용하기" }).click()
  await page.getByRole("button", { name: "테스트 도구" }).click()
  // QR은 분석 모델을 먼저 불러온 뒤 만든다(모델 첫 로딩이 연결 heartbeat를 막지 않게).
  await expect(page.locator("#connect-qr-box")).toBeVisible({ timeout: 60_000 })

  // 3~4. '[테스트용] 측면 데이터 주입' → '연결 승인'
  await page.getByRole("button", { name: "[테스트용] 측면 데이터 주입" }).click()
  await page.getByRole("button", { name: "연결 승인" }).click()
  await expect(page.locator("#connect-state")).toHaveText("연결됨")

  // 5~7. '카메라 켜기' → '기준 자세 등록' → '딥 모드 탐지 시작'
  await page.getByRole("button", { name: "카메라 켜기" }).click()
  await page.getByRole("button", { name: "기준 자세 등록" }).click()
  await expect(page.locator("#connect-reg-msg")).toHaveText("정면·측면 양쪽 기준이 등록됐어요", { timeout: 60_000 })
  await page.getByRole("button", { name: "딥 모드 탐지 시작" }).click()
  await expect(page.locator("#watch-mode")).toHaveText("딥")

  // 8. 딥 유효 입력 1초 이상을 확인한 뒤 '[테스트용] 측면 연결 끊기'
  await expect(page.locator("#watch-valid")).not.toHaveText("00:00", { timeout: 10_000 })
  await page.getByRole("button", { name: "[테스트용] 측면 연결 끊기" }).click()
  await expect(page.locator("#watch-recognition")).toHaveText("측면 입력 지연 · 판정 보류")

  // 9. 복구 대기 표시 후 '기본 모드로 계속'
  await expect(page.locator("#watch-state")).toHaveText("복구 대기", { timeout: 15_000 })
  await expect(page.locator("#watch-msg")).toContainText("휴대폰 연결이 끊겨 판정을 멈췄어요")
  const deepValid = await page.locator("#watch-valid").textContent()
  await page.getByRole("button", { name: "기본 모드로 계속" }).click()
  await expect(page.locator("#watch-mode")).toHaveText("기본")
  await expect(page.locator("#watch-state")).toHaveText("진행", { timeout: 10_000 })

  // 10. 기본 모드 유효 정면 입력 1초 이상을 확인한 뒤 '세션 종료'
  await expect(page.locator("#watch-valid")).not.toHaveText(deepValid!, { timeout: 10_000 })
  await page.waitForTimeout(1_000)
  await page.getByRole("button", { name: "세션 종료" }).click()
  await expect(page.locator("#end-save")).toHaveText("저장 완료")
  await expect(page.locator("#end-camera")).toHaveText("꺼짐")
  await expect(page.locator("#end-phone")).toHaveText(/^종료 요청·확인 안 됨/)

  // 11. '리포트 보기'
  await page.getByRole("button", { name: "리포트 보기" }).click()
  await expect(page.locator("#report-summary")).toContainText("자동 리포트 0개 · 종료 리포트 1개")
  const card = page.locator(".report-card")
  await expect(card).toHaveCount(1)
  await expect(card.locator(".badge")).toContainText("측면 연결 끊기")
  for (const label of ["확정 이탈", "최초 경고", "재경고", "정상 복귀"]) {
    await expect(fact(card, label)).toHaveText("0회")
  }
  await expect(fact(card, "이탈 시간")).toHaveText("0초")
  for (const mode of ["딥 모드", "기본 모드"]) {
    const row = fact(card, mode)
    await expect(row).toContainText("비율 0%")
    expect(await numberIn(row)).toBeGreaterThanOrEqual(1)
  }
  const log = page.locator("#report-session")
  await expect(log).toContainText("연결 장애 1회")
  await expect(log).toContainText("모드 변경")
  await expect(log).toContainText("딥 모드 · ")
  await expect(log).toContainText("기본 모드 · ")
  await expect(log).toContainText("휴대폰 촬영 종료: 종료 요청·확인 안 됨")
})
