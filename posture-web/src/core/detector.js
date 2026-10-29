// 한 프레임의 입력 품질과 기준 대비 이탈을 판정한다.
// 경계값은 p1 T1 데이터에서 잡은 파일럿 값이며 실측으로 다시 정한다(docs/prd.md 2절).
import { POLICY } from './policy.js';

export const MODEL_VERSION = 'pose_landmarker_lite/float16/1+face_landmarker/float16/1';

export const LIMITS = Object.freeze({ headForward: 0.025, neckLen: 0.035, pitch: 20 });
const MIN_VISIBILITY = 0.5;

// 배치 확인. 노트북 앞에 앉은 사용자는 어깨가 화면 폭의 약 40%를 차지했고(p1 녹화),
// 자리를 비웠을 때 뒤쪽에서 잡힌 다른 사람은 2% 이하였다. 경계는 실측 대상인 파일럿 값이다.
export const PLACEMENT = Object.freeze({ minShoulderWidth: 0.12, sizeRatio: [0.6, 1.6], maxCenterShift: 0.2 });

export const SIGNAL_KEYS = ['head_forward', 'neck_len', 'pitch_deg'];
const PLACEMENT_KEYS = ['shoulder_w', 'center_x', 'center_y'];

/**
 * 'valid' | 'away'(내 자리에 사람이 없음) | 'unrecognized'(필수 지점 품질 부족·기준과 다른 배치)
 * placement를 주면 기준 등록 때와 같은 자리·크기인지도 확인한다.
 */
export function frameQuality(sample, placement = null) {
  if (!sample) return 'away';
  if (typeof sample.shoulder_w === 'number' && sample.shoulder_w < PLACEMENT.minShoulderWidth) return 'away';
  if (!(sample.ear_vis >= MIN_VISIBILITY) || !(sample.shoulder_vis >= MIN_VISIBILITY)) return 'unrecognized';
  if (placement?.shoulder_w && typeof sample.shoulder_w === 'number') {
    const ratio = sample.shoulder_w / placement.shoulder_w;
    const shift = Math.hypot(sample.center_x - placement.center_x, sample.center_y - placement.center_y);
    if (ratio < PLACEMENT.sizeRatio[0] || ratio > PLACEMENT.sizeRatio[1] || shift > PLACEMENT.maxCenterShift) {
      return 'unrecognized';
    }
  }
  return 'valid';
}

/** 여러 프레임 평균 (순간 흔들림 완화). pitch는 잡힌 프레임만 평균 낸다. */
export function averageSamples(samples) {
  const valid = samples.filter((s) => frameQuality(s) === 'valid');
  if (!valid.length) return null;
  const avg = { ear_vis: 1, shoulder_vis: 1 };
  for (const key of [...SIGNAL_KEYS, ...PLACEMENT_KEYS]) {
    const values = valid.map((s) => s[key]).filter((v) => typeof v === 'number');
    avg[key] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }
  return avg;
}

/** 기준 대비 이탈 여부와 유형. 유형은 기록용이며 사용자에게는 공통 경고만 보인다. */
export function evaluateFrame(sample, baseline) {
  const quality = frameQuality(sample, baseline);
  if (quality !== 'valid' || !baseline) return { quality, deviated: false, types: [] };
  const types = [];
  if (sample.head_forward - baseline.head_forward >= LIMITS.headForward) types.push('head_forward');
  if (sample.neck_len - baseline.neck_len <= -LIMITS.neckLen) types.push('neck_len');
  if (typeof sample.pitch_deg === 'number' && typeof baseline.pitch_deg === 'number'
    && sample.pitch_deg - baseline.pitch_deg >= LIMITS.pitch) types.push('pitch');
  return { quality, deviated: types.length > 0, types };
}

/**
 * 안정된 유효 입력이 연속 5초 이어지면 기준을 만든다(F1).
 * 유예 시간 이하의 짧은 가림은 시간을 멈췄다가 이어서 세고, 그보다 길게 끊기거나 크게 움직이면 처음부터 다시 모은다.
 */
export class BaselineCollector {
  constructor({ seconds = POLICY.baselineStableSeconds, graceSeconds = POLICY.recognitionGraceSeconds ?? 0 } = {}) {
    this.needMs = seconds * 1000;
    this.graceMs = graceSeconds * 1000;
    this.restarts = 0;
    this.#clear();
  }

  #clear() {
    this.samples = [];
    this.stableMs = 0;
    this.lastT = null;
    this.invalidSince = null;
  }

  #restart() {
    if (this.samples.length) this.restarts += 1;
    this.#clear();
    return { status: 'restarted', progress: 0 };
  }

  /** @returns {{ status: 'collecting'|'paused'|'restarted'|'done', progress: number, baseline?: object }} */
  push(t, sample) {
    if (frameQuality(sample) !== 'valid') {
      this.invalidSince ??= t;
      if (!this.samples.length || t - this.invalidSince > this.graceMs) return this.#restart();
      return { status: 'paused', progress: this.stableMs / this.needMs };
    }
    if (this.#unstable(sample)) return this.#restart();
    // 끊겼던 사이의 시간은 안정 시간에 넣지 않는다.
    if (this.lastT !== null && this.invalidSince === null) this.stableMs += t - this.lastT;
    this.invalidSince = null;
    this.lastT = t;
    this.samples.push(sample);
    if (this.stableMs < this.needMs) return { status: 'collecting', progress: this.stableMs / this.needMs };
    return { status: 'done', progress: 1, baseline: averageSamples(this.samples) };
  }

  #unstable(sample) {
    if (!this.samples.length) return false;
    const mean = averageSamples(this.samples);
    return Math.abs(sample.head_forward - mean.head_forward) >= LIMITS.headForward
      || Math.abs(sample.neck_len - mean.neck_len) >= LIMITS.neckLen
      || (typeof sample.pitch_deg === 'number' && typeof mean.pitch_deg === 'number'
        && Math.abs(sample.pitch_deg - mean.pitch_deg) >= LIMITS.pitch / 2);
  }
}
