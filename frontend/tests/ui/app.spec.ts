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

test("설정 화면을 새로 열어도 저장한 알림 설정을 복원한다", async ({
  page,
}) => {
  await page.goto("/settings");
  await page.getByLabel("경고 시간 (초)").fill("12");
  await page.getByText("높음", { exact: true }).click();
  await page.getByLabel("소리 알림").check();
  await page.getByRole("button", { name: "적용", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  // 실제 저장 완료를 기다린 후 새 문서에서 설정을 다시 읽는다.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<boolean>((resolve, reject) => {
            const request = indexedDB.open("fast-turtle");
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const db = request.result;
              const tx = db.transaction("settings", "readonly");
              const rows = tx.objectStore("settings").getAll();
              rows.onsuccess = () =>
                resolve(
                  rows.result.some(
                    (row) =>
                      row.settings.warningSeconds === 12 &&
                      row.settings.sound &&
                      row.settings.sensitivity === "high",
                  ),
                );
              tx.oncomplete = () => db.close();
              tx.onerror = () => {
                db.close();
                reject(tx.error);
              };
            };
          }),
      ),
    )
    .toBe(true);
  await page.goto("/settings");
  await expect(page.getByLabel("경고 시간 (초)")).toHaveValue("12");
  await expect(page.getByRole("radio", { name: "높음" })).toBeChecked();
  await expect(page.getByLabel("소리 알림")).toBeChecked();
});

test("QR 서버 주소의 지원하지 않는 프로토콜을 거부하고 화면을 유지한다", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/connect");
  await expect(page.getByLabel("휴대폰 연결 QR")).toBeVisible();
  for (const address of [
    "file://localhost/example",
    "ftp://localhost",
    "http://example.com",
  ]) {
    await page
      .getByRole("textbox", { name: "휴대폰에서 접속 가능한 이 서버 주소" })
      .fill(address);
    await page.getByRole("button", { name: "QR 생성 / 재발급" }).click();
    await expect(page.getByRole("alert")).toContainText("HTTPS 서버 주소");
    await expect(page.getByLabel("휴대폰 연결 QR")).toBeVisible();
  }
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

for (const stage of ["배치 안내", "측정 화면", "영상 재생"]) {
  test(
    stage === "영상 재생"
      ? "측면 영상 재생 실패를 안내하고 다시 재생한다"
      : `${stage}에서 측면 영상 실패를 표시하고 새 QR로 재연결한다`,
    async ({ page, context }) => {
      // 영상 미리보기 실패와 측면 각도 입력의 판정 경로를 분리해 검증한다.
      await context.route("**/src/features/camera/CameraService.ts", (route) =>
        route.fulfill({
          contentType: "application/javascript",
          body: `
export class CameraService {
 constructor(callback){this.callback=callback;this.stream=null;}
 async start(){
 const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
 const paint=canvas.getContext('2d');this.stream=canvas.captureStream(10);
 this.timer=setInterval(()=>{
 paint.fillStyle='rgb('+(Date.now()%255)+',0,0)';paint.fillRect(0,0,640,480);
 this.callback({quality:'valid',signals:{head_forward:.4,neck_len:.4,ear_vis:1,shoulder_vis:1,pitch_deg:0},angle:78,earVis:.9,shoulderVis:.9,at:Date.now()});
 },250);
 }
 stop(){clearInterval(this.timer);this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;}
 dispose(){this.stop();}
}`,
        }),
      );
      if (stage === "영상 재생") {
        // 실제 중계·WebRTC 연결은 유지하고 브라우저의 첫 재생 요청 거부만 재현한다.
        await page.addInitScript(() => {
          const play = HTMLMediaElement.prototype.play;
          let rejectFirstSidePlay = true;
          HTMLMediaElement.prototype.play = function () {
            if (
              this.getAttribute("aria-label") === "휴대폰 측면 영상" &&
              rejectFirstSidePlay
            ) {
              rejectFirstSidePlay = false;
              return Promise.reject(
                new DOMException("재생 요청 거부", "NotAllowedError"),
              );
            }
            return play.call(this);
          };
        });
      } else {
        // PC에서 WebRTC를 사용할 수 없어도 승인·각도 입력·복구 UI는 동작해야 한다.
        await page.addInitScript(() => {
          Object.defineProperty(window, "RTCPeerConnection", {
            value: undefined,
          });
        });
      }
      const issuedTokens: string[] = [];
      const qr = new Promise<string>((resolve) => {
        page.on("websocket", (socket) => {
          socket.on("framereceived", ({ payload }) => {
            const message = JSON.parse(String(payload));
            if (message.type === "qr.issued") {
              issuedTokens.push(message.token);
              resolve(message.token);
            }
          });
        });
      });
      await page.goto("/");
      await page.getByRole("button", { name: "딥 모드 사용하기" }).click();
      const phone = await context.newPage();
      await phone.goto(`/phone#${await qr}`);
      await phone
        .getByRole("button", { name: "연결 요청", exact: true })
        .click();
      await page.getByRole("button", { name: "연결 승인" }).click();
      await expect(phone.getByText("연결이 완료되었어요!")).toBeVisible();
      await phone.getByRole("button", { name: "카메라 켜기" }).click();
      await page.getByRole("button", { name: "측면 배치 안내" }).click();
      if (stage === "영상 재생") {
        const alert = page.getByRole("alert");
        await expect(alert).toContainText("측면 영상을 재생하지 못했어요", {
          timeout: 15000,
        });
        await alert.getByRole("button", { name: "영상 다시 재생" }).click();
        await expect(alert).toHaveCount(0);
        await expect(
          page.getByText("측면 입력이 유효해요", { exact: true }),
        ).toBeVisible();
        await expect(phone.getByText("연결이 완료되었어요!")).toBeVisible();
        expect(issuedTokens).toHaveLength(1);
        await phone.close();
        return;
      }
      if (stage === "측정 화면") {
        await page.getByRole("button", { name: "확인했어요" }).click();
        await page.getByRole("button", { name: "카메라 켜기" }).click();
        await page.getByRole("checkbox").check();
        const register = page.getByRole("button", {
          name: "기준 자세 등록",
          exact: true,
        });
        await expect(register).toBeEnabled();
        await register.click();
        const begin = page.getByRole("button", {
          name: "딥 모드 탐지 시작",
          exact: true,
        });
        await expect(begin).toBeEnabled({ timeout: 15000 });
        await begin.click();
      }
      const alert = page.getByRole("alert");
      await expect(alert).toContainText("측면 영상을 불러오지 못했어요");
      await alert.getByRole("button", { name: "휴대폰 다시 연결" }).click();
      await expect(page).toHaveURL(/\/connect$/);
      await expect(page.getByLabel("휴대폰 연결 QR")).toBeVisible();
      await expect.poll(() => issuedTokens.length).toBe(2);
      expect(issuedTokens[1]).not.toBe(issuedTokens[0]);
      await expect(phone.getByText("연결이 완료되었어요!")).toHaveCount(0);
      await phone.close();
    },
  );
}
