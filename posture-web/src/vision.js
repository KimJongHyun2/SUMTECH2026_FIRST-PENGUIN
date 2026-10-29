import { FaceLandmarker, FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

// 실행 중 외부 사이트에 기대지 않도록 wasm(scripts/copy-mediapipe-wasm.mjs)과 모델(public/models)을 우리 서버에서 제공한다.
const WASM_URL = '/mediapipe/wasm';
const POSE_MODEL = '/models/pose_landmarker_lite.task';
const FACE_MODEL = '/models/face_landmarker.task';

let filesetPromise;
const fileset = () => (filesetPromise ??= FilesetResolver.forVisionTasks(WASM_URL));

export async function createPose() {
  return PoseLandmarker.createFromOptions(await fileset(), {
    baseOptions: { modelAssetPath: POSE_MODEL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    // 뒤쪽의 다른 사람이 함께 잡혀도 가장 가까운 사람을 고를 수 있게 여러 명을 찾는다.
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
