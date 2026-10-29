import { expect, test } from "@playwright/test";
test("routes, validation and mobile layout", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const route of ["/", "/setup", "/history", "/report", "/settings"]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    expect(
      await page
        .locator("img")
        .evaluateAll((imgs) =>
          imgs.every(
            (i) =>
              (i as HTMLImageElement).complete &&
              (i as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    ).toBe(true);
  }
  await page.getByLabel("경고 시간 (초)").fill("0");
  await page.getByRole("button", { name: "적용", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("양의 정수");
  await page.getByLabel("경고 시간 (초)").fill("12");
  await page.getByRole("button", { name: "적용", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("synthetic camera registration, monitoring and stopping tracks", async ({
  page,
}) => {
  await page.route("**/src/features/camera/CameraService.ts", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
 export class CameraService {
 constructor(callback){this.callback=callback;this.stream=null;}
 async start(){ const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;this.stream=canvas.captureStream(10);window.testTracks=this.stream.getTracks();this.timer=setInterval(()=>this.callback({quality:'valid',signals:{head_forward:.4,neck_len:.4,ear_vis:1,shoulder_vis:1,pitch_deg:0},angle:null,at:Date.now()}),250);}
 stop(){clearInterval(this.timer);this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;}
 dispose(){this.stop();}
 }`,
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: /자세 등록하고 시작/ }).click();
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByRole("button", { name: "카메라 켜기" }).click();
  const register = page.getByRole("button", {
    name: "기준 자세 등록",
    exact: true,
  });
  await expect(register).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(register).toBeEnabled();
  await register.click();
  const begin = page.getByRole("button", { name: "탐지 시작", exact: true });
  await expect(begin).toBeEnabled({ timeout: 10000 });
  await begin.click();
  await expect(page).toHaveURL(/\/watch$/);
  await page.screenshot({ path: "test-results/watch.png", fullPage: true });
  await page.getByRole("button", { name: "일시 정지", exact: true }).click();
  expect(
    await page.evaluate(() =>
      (window as any).testTracks.every(
        (t: MediaStreamTrack) => t.readyState === "ended",
      ),
    ),
  ).toBe(true);
});
