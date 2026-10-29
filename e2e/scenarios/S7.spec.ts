import { expect, test } from "@playwright/test"
import { fact, numberIn, useRecordedCamera } from "../helpers"

test("S7 대학생이 직접 만든 로컬 세션을 조회하고 삭제한다", async ({ page }) => {
  await page.goto("/")
  await useRecordedCamera(page, "good")

  // 1. 첫 화면에서 '자세 등록하고 시작'을 누른다
  await page.getByRole("button", { name: "자세 등록하고 시작" }).click()

  // 2. 카메라 설정 화면에서 '카메라 켜기'를 누른다
  await page.getByRole("button", { name: "카메라 켜기" }).click()
  await expect(page.locator("#setup-camera")).toHaveText("켜짐", { timeout: 60_000 })

  // 3. 안정된 자세에서 '기준 자세 등록'을 누른다
  await page.getByRole("button", { name: "기준 자세 등록" }).click()
  await expect(page.locator("#setup-msg")).toHaveText("기준 자세가 등록됐어요", { timeout: 30_000 })
  await expect(page.locator("#setup-baseline")).toHaveText(/^ID b-/)
  const baselineId = (await page.locator("#setup-baseline").textContent())!.split(" · ")[0]

  // 4. 기준 등록 완료 후 '탐지 시작'을 누른다
  await expect(page.getByRole("button", { name: "탐지 시작" })).toBeEnabled()
  await page.getByRole("button", { name: "탐지 시작" }).click()

  // 5. 기준 범위의 자세를 연속 유효 5초 동안 유지한다
  await expect(page.locator("#watch-valid")).toHaveText(/^00:0[5-9]$/, { timeout: 20_000 })

  // 6. 감지 화면에서 '세션 종료'를 누른다
  await page.getByRole("button", { name: "세션 종료" }).click()

  // 7. 저장 완료 후 종료 화면에서 '내 기록'을 누른다
  await expect(page.locator("#end-save")).toHaveText("저장 완료")
  await page.getByRole("button", { name: "내 기록" }).click()

  // 8. 기록 목록에서 방금 종료한 세션을 선택한다
  await expect(page.locator("#history-counts")).toHaveText("저장된 세션 1개 · 리포트 1개")
  await page.locator("#history-list").getByRole("button").click()

  // 세션 1개·종료 리포트 1개, 이탈·경고·정상 복귀 0회
  const detail = page.locator("#history-detail")
  await expect(fact(detail, "리포트")).toHaveText("자동 0개 · 종료 1개")
  await expect(fact(detail, "확정 이탈")).toHaveText("0회")
  await expect(fact(detail, "최초 경고")).toHaveText("0회")
  await expect(fact(detail, "재경고")).toHaveText("0회")
  await expect(fact(detail, "정상 복귀")).toHaveText("0회")

  // V는 실제 유효 시간으로 최소 5초, D=0초·이탈 비율 0%
  expect(await numberIn(fact(detail, "유효 감지 시간"))).toBeGreaterThanOrEqual(5)
  await expect(fact(detail, "이탈 시간")).toHaveText("0초")
  await expect(fact(detail, "이탈 비율")).toHaveText("0%")

  // 9. 세션 상세에서 '기록 삭제'를 누른다
  await page.getByRole("button", { name: "기록 삭제" }).click()

  // 10. 삭제 확인 화면에서 '삭제 확인'을 누른다
  await page.getByRole("button", { name: "삭제 확인" }).click()

  // expected: 세션·리포트 0개, '저장된 기록이 없어요', 현재 등록 기준은 유지
  await expect(page.getByText("저장된 기록이 없어요")).toBeVisible()
  await expect(page.locator("#history-counts")).toHaveText("저장된 세션 0개 · 리포트 0개")
  await expect(page.locator("#history-list").getByRole("button")).toHaveCount(0)
  await expect(page.locator("#history-baseline")).toContainText(`현재 등록 기준: ${baselineId}`)
})
