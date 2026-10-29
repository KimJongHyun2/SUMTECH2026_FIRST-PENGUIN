// 휴대폰 측면 카메라: 켜기·끄기, 한 프레임에서 옆모습 각도 추출, 미리보기. 영상은 이 기기에서만 처리하고 저장하지 않는다.
// PC로는 각도·품질 값만 보낸다(원본 영상·좌표는 보내지 않는다).
import { MIN_VISIBILITY } from '../core/detector.js';
import { POSE, largestPose, sideAngle } from '../signals.js';
import { createPose, startCamera } from '../vision.js';
import { warmUp } from './camera.js';

const clamp01 = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
const NOT_FOUND = Object.freeze({ valid: false, angleDeg: null, earVis: 0, shoulderVis: 0 });

export class SideCamera {
  constructor(video, canvas) {
    this.video = video;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pose = null;
    this.on = false;
    this.facing = 'user';
  }

  /** 분석 모델을 불러오고 첫 추론까지 끝낸다. 연결 요청 전에 불러 두어 승인 뒤 heartbeat가 끊기지 않게 한다. */
  async prepare() {
    this.loading ??= createPose().then((pose) => {
      warmUp([pose]);
      return pose;
    });
    try {
      this.pose = await this.loading;
    } catch (error) {
      this.loading = null; // 실패하면 다음 시도에서 다시 불러온다
      throw error;
    }
  }

  /** 실패하면 브라우저 오류(NotAllowedError 등)를 그대로 던진다. */
  async start(facing = this.facing) {
    await this.prepare();
    await startCamera(this.video, facing);
    this.facing = facing;
    this.canvas.width = this.video.videoWidth;
    this.canvas.height = this.video.videoHeight;
    this.on = true;
  }

  stop() {
    this.video.srcObject?.getTracks().forEach((track) => track.stop());
    this.video.srcObject = null;
    this.on = false;
  }

  /** @returns {{ valid: boolean, angleDeg: number|null, earVis: number, shoulderVis: number, landmarks?: object[] }} */
  analyze() {
    const v = this.video;
    if (!this.on || v.readyState < 2) return NOT_FOUND;
    const landmarks = largestPose(this.pose.detectForVideo(v, performance.now()).landmarks);
    if (!landmarks) return NOT_FOUND;
    const s = sideAngle(landmarks, v.videoWidth, v.videoHeight);
    const earVis = clamp01(s.ear_vis);
    const shoulderVis = clamp01(s.shoulder_vis);
    // 귀가 어깨보다 아래로 잡히는 등 0~180°를 벗어난 각도는 옆모습으로 보지 않는다.
    const valid = earVis >= MIN_VISIBILITY && shoulderVis >= MIN_VISIBILITY && s.angle_deg >= 0 && s.angle_deg <= 180;
    return { valid, angleDeg: valid ? Math.round(s.angle_deg * 10) / 10 : null, earVis, shoulderVis, landmarks };
  }

  /** 전면 카메라는 거울처럼 뒤집어 그리고, 귀(빨강)·어깨(파랑)를 표시한다. */
  draw(landmarks) {
    const { width: w, height: h } = this.canvas;
    const ctx = this.ctx;
    const mirror = this.facing === 'user';
    ctx.save();
    if (mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(this.video, 0, 0, w, h);
    ctx.restore();
    if (!landmarks) return;
    for (const [i, color] of [[POSE.L_EAR, '#e46a55'], [POSE.R_EAR, '#e46a55'], [POSE.L_SHOULDER, '#4f8fe4'], [POSE.R_SHOULDER, '#4f8fe4']]) {
      const p = landmarks[i];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc((mirror ? 1 - p.x : p.x) * w, p.y * h, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
