import { expect, test, type Page } from "@playwright/test";
// 평가 빌드의 녹화 입력·테스트 도구로 실제 추론·판정·저장 경로를 끝까지 돌린다.
// 녹화 영상·모의 측면 입력을 쓰므로 실제 카메라·휴대폰·주최 측 실행 통과를 뜻하지 않는다.
test.describe.configure({ timeout: 180_000 });

async function registerAndStart(page: Page, start: string) {
  await page.getByRole("button", { name: "카메라 켜기" }).click();
  await page.getByRole("checkbox").check();
  const register = page.getByRole("button", {
    name: "기준 자세 등록",
    exact: true,
  });
  await expect(register).toBeEnabled({ timeout: 60_000 });
  await register.click();
  const begin = page.getByRole("button", { name: start, exact: true });
  await expect(begin).toBeEnabled({ timeout: 30_000 });
  await begin.click();
  await expect(page).toHaveURL(/\/watch$/);
}

test("basic mode: recorded deviation and recovery end in a saved report", async ({
  page,
}) => {
  await page.goto("/?mode=eval");
  await expect(page.getByText("평가 모드 · 녹화 입력")).toBeVisible();
  await page.getByRole("button", { name: "자세 등록하고 시작" }).click();
  await registerAndStart(page, "탐지 시작");
  await page.getByRole("button", { name: "테스트 도구" }).click();
  await page
    .getByRole("button", { name: "[테스트용] 정면 이탈·복귀 재생" })
    .click();
  await expect(page.getByText("정면 이탈·복귀 재생 완료")).toBeVisible({
    timeout: 90_000,
  });
  await page.getByRole("button", { name: "세션 종료" }).click();
  await expect(page.getByText(/저장 완료/)).toBeVisible();
  await expect(page.getByText(/확정 이탈 1회 · 정상 복귀 1회/)).toBeVisible();
  await expect(page.getByText(/테스트 표시: 녹화 입력/)).toBeVisible();
});

test("deep mode: injected side input through the real relay, approved on PC", async ({
  page,
}) => {
  await page.goto("/?mode=eval");
  await page.getByRole("button", { name: "딥 모드 사용하기" }).click();
  await expect(page.getByLabel("휴대폰 연결 QR")).toBeVisible();
  await page.getByRole("button", { name: "테스트 도구" }).click();
  await page.getByRole("button", { name: "[테스트용] 측면 데이터 주입" }).click();
  await page.getByRole("button", { name: "연결 승인" }).click();
  await page.getByRole("button", { name: "측면 배치 안내" }).click();
  await page.getByRole("button", { name: "확인했어요" }).click();
  await registerAndStart(page, "딥 모드 탐지 시작");
  await page.getByRole("button", { name: "테스트 도구" }).click();
  await page
    .getByRole("button", { name: "[테스트용] 양쪽 이탈·복귀 재생" })
    .click();
  await expect(page.getByText("양쪽 이탈·복귀 재생 완료")).toBeVisible({
    timeout: 90_000,
  });
  await page.getByRole("button", { name: "세션 종료" }).click();
  await expect(page.getByText(/휴대폰 카메라 종료 확인/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/확정 이탈 1회 · 정상 복귀 1회/)).toBeVisible();
  await expect(page.getByText(/측면 데이터 주입/)).toBeVisible();
});
