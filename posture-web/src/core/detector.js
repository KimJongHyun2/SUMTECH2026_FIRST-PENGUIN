// 한 프레임의 입력 품질과 기준 대비 이탈을 판정한다.
// 경계값은 p1 T1 데이터에서 잡은 파일럿 값이다(거북목_약 Δ목길이 −0.041, 고개숙임 Δpitch +31°).
// 민감도 배율도 파일럿 값이며 실측으로 다시 정한다(docs/planning-policy.yaml threshold).
import { POLICY } from './policy.js';

export const MODEL_VERSION = 'pose_landmarker_lite/float16/1+face_landmarker/float16/1';

const BASE_LIMITS = { headForward: 0.025, neckLen: 0.035, pitch: 20 };
const SENSITIVITY_SCALE = { low: 1.5, normal: 1, high: 0.7 };
const MIN_VISIBILITY = 0.5;

export const SIGNAL_KEYS = ['head_forward', 'neck_len', 'pitch_deg'];

/** 'valid' | 'away'(사람이 안 보임) | 'unrecognized'(필수 지점 품질 부족) */
export function frameQuality(sample) {
  if (!sample) return 'away';
  if (!(sample.ear_vis >= MIN_VISIBILITY) || !(sample.shoulder_vis >= MIN_VISIBILITY)) return 'unrecognized';
  return 'valid';
}

export function limitsFor(sensitivity = 'normal') {
  const k = SENSITIVITY_SCALE[sensitivity] ?? 1;
  return { headForward: BASE_LIMITS.headForward * k, neckLen: BASE_LIMITS.neckLen * k, pitch: BASE_LIMITS.pitch * k };
}

/** 여러 프레임 평균 (순간 흔들림 완화). pitch는 잡힌 프레임만 평균 낸다. */
export function averageSamples(samples) {
  const valid = samples.filter((s) => frameQuality(s) === 'valid');
  if (!valid.length) return null;
  const avg = { ear_vis: 1, shoulder_vis: 1 };
  for (const key of SIGNAL_KEYS) {
    const values = valid.map((s) => s[key]).filter((v) => typeof v === 'number');
    avg[key] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }
  return avg;
}

/** 기준 대비 이탈 여부와 유형. 유형은 기록용이며 사용자에게는 공통 경고만 보인다. */
export function evaluateFrame(sample, baseline, sensitivity = 'normal') {
  const quality = frameQuality(sample);
  if (quality !== 'valid' || !baseline) return { quality, deviated: false, types: [] };
  const limits = limitsFor(sensitivity);
  const types = [];
  if (sample.head_forward - baseline.head_forward >= limits.headForward) types.push('head_forward');
  if (sample.neck_len - baseline.neck_len <= -limits.neckLen) types.push('neck_len');
  if (typeof sample.pitch_deg === 'number' && typeof baseline.pitch_deg === 'number'
    && sample.pitch_deg - baseline.pitch_deg >= limits.pitch) types.push('pitch');
  return { quality, deviated: types.length > 0, types };
}

/**
 * 안정된 유효 입력이 연속 5초 이어지면 기준을 만든다.
 * 인식이 끊기거나 크게 움직이면 처음부터 다시 모은다(F1).
 */
export class BaselineCollector {
  constructor({ seconds = POLICY.baselineStableSeconds } = {}) {
    this.needMs = seconds * 1000;
    this.reset();
  }

  reset() {
    this.samples = [];
    this.startT = null;
    this.restarts = 0;
  }

  /** @returns {{ status: 'collecting'|'restarted'|'done', progress: number, baseline?: object }} */
  push(t, sample) {
    if (frameQuality(sample) !== 'valid' || this.#unstable(sample)) {
      const hadData = this.samples.length > 0;
      this.samples = [];
      this.startT = null;
      if (hadData) this.restarts += 1;
      return { status: 'restarted', progress: 0 };
    }
    if (this.startT === null) this.startT = t;
    this.samples.push(sample);
    const elapsed = t - this.startT;
    if (elapsed < this.needMs) return { status: 'collecting', progress: elapsed / this.needMs };
    return { status: 'done', progress: 1, baseline: averageSamples(this.samples) };
  }

  #unstable(sample) {
    if (!this.samples.length) return false;
    const mean = averageSamples(this.samples);
    const limits = limitsFor('normal');
    return Math.abs(sample.head_forward - mean.head_forward) >= limits.headForward
      || Math.abs(sample.neck_len - mean.neck_len) >= limits.neckLen
      || (typeof sample.pitch_deg === 'number' && typeof mean.pitch_deg === 'number'
        && Math.abs(sample.pitch_deg - mean.pitch_deg) >= limits.pitch / 2);
  }
}
