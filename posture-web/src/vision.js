import { FaceLandmarker, FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

// 실행 중 외부 사이트에 기대지 않도록 wasm(scripts/copy-mediapipe-wasm.mjs)과 모델(public/models)을 우리 서버에서 제공한다.
const WASM_URL = '/mediapipe/wasm';
const POSE_MODELS = {
  lite: '/models/pose_landmarker_lite.task',
  // 실험 도구(?model=full) 전용. 서비스는 lite만 쓴다.
  full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
};
const FACE_MODEL = '/models/face_landmarker.task';

let filesetPromise;
const fileset = () => (filesetPromise ??= FilesetResolver.forVisionTasks(WASM_URL));

/** 주소에 ?model=full 을 붙이면 더 정확하지만 느린 모델을 쓴다. */
export function poseModelFromUrl() {
  return new URLSearchParams(location.search).get('model') === 'full' ? 'full' : 'lite';
}

export async function createPose(model = 'lite') {
  return PoseLandmarker.createFromOptions(await fileset(), {
    baseOptions: { modelAssetPath: POSE_MODELS[model], delegate: 'GPU' },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
}

export async function createFace() {
  return FaceLandmarker.createFromOptions(await fileset(), {
    baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFacialTransformationMatrixes: true,
  });
}

export async function startCamera(video, facingMode = 'user') {
  if (video.srcObject) video.srcObject.getTracks().forEach((t) => t.stop());
  video.srcObject = await navigator.mediaDevices.getUserMedia({
    video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  await video.play();
}

/** 최근 1초 동안 처리한 프레임 수 */
export function createFpsMeter() {
  const stamps = [];
  return () => {
    const now = performance.now();
    stamps.push(now);
    while (stamps.length && now - stamps[0] > 1000) stamps.shift();
    return stamps.length;
  };
}

export function drawPoints(ctx, points, w, h, color = '#22c55e') {
  ctx.fillStyle = color;
  for (const p of points) {
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 현재 탭의 호스트로 중계 WebSocket을 연결하고, 끊기면 2초 뒤 다시 붙는다. */
export function connectRelay(onMessage, onStatus) {
  let ws;
  const open = () => {
    ws = new WebSocket(`wss://${location.host}/relay`);
    ws.onopen = () => onStatus?.(true);
    ws.onclose = () => { onStatus?.(false); setTimeout(open, 2000); };
    ws.onmessage = (e) => onMessage?.(JSON.parse(e.data));
  };
  open();
  return { send: (msg) => ws?.readyState === 1 && ws.send(JSON.stringify(msg)) };
}
