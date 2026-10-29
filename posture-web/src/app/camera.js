// PC 정면 카메라: 켜기·끄기, 한 프레임 분석, 미리보기. 영상은 이 기기에서만 처리하고 저장하지 않는다.
import { createFace, createPose, startCamera } from '../vision.js';
import { POSE, frontSignals, largestPose, pitchFromMatrix } from '../signals.js';

// 영상 프레임이 이 시간 이상 바뀌지 않으면 입력 갱신 중단(인식 불가)으로 본다.
const FROZEN_MS = 1500;

export class FrontCamera {
  /** recorded: 평가 모드의 녹화 입력(RecordedInput). 있으면 실제 카메라 권한을 요청하지 않는다. */
  constructor(video, canvas, recorded = null) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.recorded = recorded;
    this.on = false;
    this.models = null;
    this.lastVideoTime = -1;
    this.frozenSince = null;
    this.label = '';
  }

  /** 실패하면 브라우저 오류(NotAllowedError 등)나 EvalInputError를 그대로 던진다. */
  async start() {
    this.models ??= await Promise.all([createPose('lite'), createFace()]);
    if (this.recorded) {
      await this.recorded.start(this.video);
      this.label = this.recorded.label;
    } else {
      await startCamera(this.video, 'user');
      this.label = this.video.srcObject.getVideoTracks()[0]?.label ?? '';
    }
    this.canvas.width = this.video.videoWidth;
    this.canvas.height = this.video.videoHeight;
    this.lastVideoTime = -1;
    this.frozenSince = null;
    this.on = true;
  }

  stop() {
    this.recorded?.stop();
    this.video.srcObject?.getTracks().forEach((track) => track.stop());
    this.video.srcObject = null;
    this.on = false;
  }

  get size() {
    return { width: this.video.videoWidth, height: this.video.videoHeight };
  }

  /** @returns {{ sample: object|null, faceFound: boolean, landmarks: object[]|undefined }} */
  analyze() {
    const v = this.video;
    if (!this.on || v.readyState < 2) return { sample: null, faceFound: false };
    const now = performance.now();
    if (v.currentTime === this.lastVideoTime) this.frozenSince ??= now;
    else {
      this.frozenSince = null;
      this.lastVideoTime = v.currentTime;
    }
    if (this.frozenSince !== null && now - this.frozenSince > FROZEN_MS) {
      // 필수 지점을 신뢰할 수 없는 입력으로 표시한다.
      return { sample: { ear_vis: 0, shoulder_vis: 0 }, faceFound: false };
    }

    const [pose, face] = this.models;
    const landmarks = largestPose(pose.detectForVideo(v, now).landmarks);
    const faces = face.detectForVideo(v, now);
    const matrix = faces.facialTransformationMatrixes?.[largestFaceIndex(faces.faceLandmarks)]?.data;
    const signals = landmarks ? frontSignals(landmarks, v.videoWidth, v.videoHeight) : null;
    return {
      landmarks,
      faceFound: Boolean(matrix),
      sample: signals && { ...signals, pitch_deg: matrix ? pitchFromMatrix(matrix) : null },
    };
  }

  /** 거울처럼 좌우를 뒤집어 그리고 귀(빨강)·어깨(파랑)를 표시한다. */
  draw(landmarks) {
    const { width: w, height: h } = this.canvas;
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(this.video, 0, 0, w, h);
    ctx.restore();
    if (!landmarks) return;
    const dot = (i, color) => {
      const p = landmarks[i];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc((1 - p.x) * w, p.y * h, 6, 0, Math.PI * 2);
      ctx.fill();
    };
    dot(POSE.L_EAR, '#e46a55');
    dot(POSE.R_EAR, '#e46a55');
    dot(POSE.L_SHOULDER, '#4f8fe4');
    dot(POSE.R_SHOULDER, '#4f8fe4');
  }
}

/** 화면에서 가장 넓게 보이는(가장 가까운) 얼굴의 번호. 없으면 -1 */
function largestFaceIndex(faces = []) {
  let best = -1;
  let bestWidth = -1;
  faces.forEach((points, i) => {
    const xs = points.map((p) => p.x);
    const width = Math.max(...xs) - Math.min(...xs);
    if (width > bestWidth) {
      best = i;
      bestWidth = width;
    }
  });
  return best;
}

export function cameraErrorMessage(error) {
  // 평가 입력 실패는 실제 카메라 권한 문제와 구분해 그대로 알린다.
  if (error?.name === 'EvalInputError') return error.message;
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return "카메라를 쓸 수 없어요. 브라우저 주소창의 카메라 권한을 허용한 뒤 '카메라 켜기'를 다시 눌러 주세요.";
  }
  if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') {
    return "카메라를 쓸 수 없어요. 연결된 카메라를 확인한 뒤 '카메라 켜기'를 다시 눌러 주세요.";
  }
  return `카메라를 쓸 수 없어요. 다시 시도해 주세요. (${error?.message ?? error})`;
}
