import { cp, mkdir } from "node:fs/promises";
// 기존 카메라 프로젝트는 읽기만 한다. 대용량 모델과 WASM은 실행/빌드 시 복사한다.
await mkdir(new URL("../public/mediapipe/wasm/", import.meta.url), {
  recursive: true,
});
await cp(
  new URL("../node_modules/@mediapipe/tasks-vision/wasm/", import.meta.url),
  new URL("../public/mediapipe/wasm/", import.meta.url),
  { recursive: true },
);
await cp(
  new URL("../../posture-web/public/models/", import.meta.url),
  new URL("../public/models/", import.meta.url),
  { recursive: true },
);
console.log("frontend용 카메라 모델·WASM 준비 완료");
