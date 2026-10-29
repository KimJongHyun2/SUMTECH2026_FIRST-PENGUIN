import { expect, test } from "@playwright/test"
import { fact, numberIn } from "../helpers"

const seconds = (clock: string | null) => {
  const [m, s] = (clock ?? "00:00").split(":").map(Number)
  return m * 60 + s
}

test("S6 대학생이 딥 모드 장애 시 판정 보류 후 기본 모드로 안전 전환한다", async ({ page }) => {
  // 평가 전용 빌드: 정면은 녹화 영상, 측면은 테스트 휴대폰이 실제 연결 서버(/relay)를 거쳐 공급한다.
  await page.goto("/?mode=eval")

  // 1. 평가 전용 빌드의 PC 첫 화면(/?mode=eval)에서 '딥 모드 사용하기'를 누른다
  await page.getByRole("button", { name: "딥 모드 사용하기" }).click()
  await expect(page.locator("#connect-qr-state")).toHaveText(/초 남음$/)

  // 2. PC 연결 화면에서 '테스트 도구'를 누른다
  await page.getByRole("button", { name: "테스트 도구" }).click()

  // 3. 테스트 도구에서 '[테스트용] 측면 데이터 주입'을 눌러 휴대폰 연결 요청과 유효 측면 입력을 시뮬레이션한다
  await page.getByRole("button", { name: "[테스트용] 측면 데이터 주입" }).click()
  await expect(page.locator("#connect-state")).toHaveText("연결 요청 있음")

  // 4. PC 연결 화면에서 '연결 승인'을 누른다
  await page.getByRole("button", { name: "연결 승인" }).click()
  await expect(page.locator("#connect-state")).toHaveText("연결됨")

  // 5. PC에서 '카메라 켜기'를 누른다
  await page.getByRole("button", { name: "카메라 켜기" }).click()
  await expect(page.locator("#connect-camera")).toHaveText("켜짐", { timeout: 60_000 })

  // 6. PC에서 '기준 자세 등록'을 누른다
  await page.getByRole("button", { name: "기준 자세 등록" }).click()
  await expect(page.locator("#connect-msg")).toHaveText("양쪽 기준 자세가 등록됐어요", { timeout: 30_000 })

  // 7. 양쪽 기준 등록 완료 후 PC에서 '딥 모드 탐지 시작'을 누른다
  await page.getByRole("button", { name: "딥 모드 탐지 시작" }).click()
  await expect(page.locator("#watch-state")).toHaveText("진행", { timeout: 20_000 })
  await expect(page.locator("#watch-mode")).toHaveText("딥")
  const sessionId = await page.locator("#watch-session").textContent()

  // 8. 딥 유효 입력 1초 이상을 확인한 뒤 '[테스트용] 측면 연결 끊기'를 눌러 측면 입력 중단·연결 끊김·종료 무응답을 주입한다
  await expect(page.locator("#watch-valid")).not.toHaveText("00:00", { timeout: 10_000 })
  await page.getByRole("button", { name: "[테스트용] 측면 연결 끊기" }).click()
  // 측면 입력이 끊기면 정면만으로 판정하지 않고 즉시 보류한다.
  await expect(page.locator("#watch-recognition")).toHaveText("인식 불가 · 판정 보류", { timeout: 5_000 })

  // 9. 복구 대기 표시 후 PC에서 '기본 모드로 계속'을 누른다
  await expect(page.locator("#watch-state")).toHaveText("복구 대기", { timeout: 15_000 })
  await page.getByRole("button", { name: "기본 모드로 계속" }).click()
  await expect(page.locator("#watch-state")).toHaveText("진행")
  await expect(page.locator("#watch-mode")).toHaveText("기본")
  await expect(page.locator("#watch-session")).toHaveText(sessionId!)

  // 10. 기본 모드 유효 정면 입력 1초 이상을 확인한 뒤 PC에서 '세션 종료'를 누른다
  const switchedAt = seconds(await page.locator("#watch-valid").textContent())
  await expect.poll(async () => seconds(await page.locator("#watch-valid").textContent()), { timeout: 10_000 })
    .toBeGreaterThanOrEqual(switchedAt + 2)
  await page.getByRole("button", { name: "세션 종료" }).click()
  await expect(page.locator("#end-camera")).toHaveText("꺼짐")
  await expect(page.locator("#end-save")).toHaveText("저장 완료")
  await expect(page.locator("#end-phone")).toHaveText("종료 요청·확인 안 됨")

  // 11. PC 종료 화면에서 '리포트 보기'를 누른다
  await page.getByRole("button", { name: "리포트 보기" }).click()

  // expected: 같은 세션의 딥·기본 구간, 장애·모드 변경 사유, 이탈·경고·복귀·자동 리포트 각 0, D=0초, 각 모드 V>=1초·비율 0%
  await expect(page.locator("#report-summary")).toContainText(`세션 ID ${sessionId}`)
  await expect(page.locator("#report-summary")).toContainText("자동 리포트 0개 · 종료 리포트 1개")
  const report = page.locator(".report-card")
  await expect(report).toHaveCount(1)
  await expect(report.locator(".badge")).toContainText("측면 연결 끊기")
  await expect(fact(report, "확정 이탈")).toHaveText("0회")
  await expect(fact(report, "최초 경고")).toHaveText("0회")
  await expect(fact(report, "재경고")).toHaveText("0회")
  await expect(fact(report, "정상 복귀")).toHaveText("0회")
  await expect(fact(report, "이탈 시간")).toHaveText("0초")
  await expect(fact(report, "이탈 비율")).toHaveText("0%")
  for (const mode of ["딥 모드", "기본 모드"]) {
    await expect(fact(report, mode)).toHaveText(/^유효 \d+초 · 이탈 0초 · 비율 0%$/)
    expect(await numberIn(fact(report, mode))).toBeGreaterThanOrEqual(1)
  }
  const log = page.locator("#report-session")
  await expect(log).toContainText("딥 모드")
  await expect(log).toContainText("기본 모드")
  await expect(log).toContainText("연결 장애 1회")
  await expect(log).toContainText("모드 변경 1회")
})
