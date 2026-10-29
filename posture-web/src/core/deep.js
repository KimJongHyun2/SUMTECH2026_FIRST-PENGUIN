// 딥 모드 판정 (F9·F10, docs/prd.md 6절). 정면 판정에 휴대폰 측면 입력을 더한다. 화면·연결과 분리된 순수 로직이다.
// 유효하고 동기화된 두 입력만 결합하고, 한쪽이라도 무효이면 전체 판정을 보류한다.
import { CONNECTION_PILOT } from '../../shared/deep-protocol.js';
import { BaselineCollector } from './detector.js';
import { SENSITIVITY } from './policy.js';

// 측면 각도(수평선과 어깨→귀 선)는 머리가 앞으로 나올수록 작아진다.
// angleDrop: 기준 대비 이만큼 줄면 이탈. 목 굽힘 연구의 '중립 대비 15° 이상 = 주의'를 옮긴 파일럿 값이다.
// stableRange: 기준 등록 중 측면 각도가 이 범위를 넘게 흔들리면 처음부터 다시 센다(파일럿 값).
export const SIDE_LIMITS = Object.freeze({ angleDrop: 15, stableRange: 8 });

const SIDE_MAX_AGE_MS = CONNECTION_PILOT.sideMaxAgeSeconds * 1000;

/**
 * 정면 입력 시각(서버 시각)에 결합할 수 있는 측면 입력인지.
 * @returns 'valid' | 'side_stale'(없음·지연·갱신 중단) | 'side_unrecognized'(휴대폰이 귀·어깨를 못 찾음)
 */
export function sideQuality(side, frontServerTime, { idle = false, maxAgeMs = SIDE_MAX_AGE_MS } = {}) {
  if (!side || idle) return 'side_stale';
  if (Math.abs(frontServerTime - side.t) > maxAgeMs) return 'side_stale';
  return side.valid ? 'valid' : 'side_unrecognized';
}

/** 정면 판정(evaluateFrame 결과)과 측면 입력을 합친다. 정면이 무효이면 정면 사유가 먼저다. */
export function fuseDeep(front, sideQ, side, baselineAngle, sensitivity = 'normal') {
  if (front.quality !== 'valid') return front;
  if (sideQ !== 'valid') return { quality: sideQ, deviated: false, types: [] };
  if (typeof baselineAngle !== 'number') return { quality: 'side_unrecognized', deviated: false, types: [] };
  const k = SENSITIVITY[sensitivity]?.scale ?? 1;
  const types = [...front.types];
  if (baselineAngle - side.angleDeg >= SIDE_LIMITS.angleDrop * k) types.push('side_angle');
  return { quality: 'valid', deviated: types.length > 0, types };
}

/** 양쪽 기준 등록: 정면·측면이 함께 연속 안정 5초여야 한다. 한쪽이 끊기거나 흔들리면 처음부터 다시 센다. */
export class DeepBaselineCollector {
  constructor(options) {
    this.front = new BaselineCollector(options);
    this.angles = [];
  }

  get restarts() { return this.front.restarts; }

  /** @returns BaselineCollector.push 결과 + 다시 셀 때 reason('front'|'side_stale'|'side_unrecognized'|'side_unstable') */
  push(t, frontSample, sideQ, side) {
    const sideOk = sideQ === 'valid';
    // 측면이 무효이면 정면도 무효 입력처럼 다룬다(같은 연속성 규칙).
    const result = this.front.push(t, sideOk ? frontSample : null);
    if (result.status === 'restarted') {
      this.angles = [];
      return { ...result, reason: sideOk ? 'front' : sideQ };
    }
    if (result.status === 'paused') return result;
    if (this.#unstable(side.angleDeg)) {
      this.angles = [];
      return { ...this.front.restart(), reason: 'side_unstable' };
    }
    this.angles.push(side.angleDeg);
    if (result.status !== 'done') return result;
    const mean = this.angles.reduce((a, b) => a + b, 0) / this.angles.length;
    return { ...result, baseline: { ...result.baseline, side_angle_deg: mean } };
  }

  #unstable(angle) {
    if (!this.angles.length) return false;
    const all = [...this.angles, angle];
    return Math.max(...all) - Math.min(...all) > SIDE_LIMITS.stableRange;
  }
}

/** 기기 시계와 서버 시계의 차이. hello로 처음 잡고, 왕복이 가장 짧았던 ping/pong으로 고친다. */
export class ClockOffset {
  constructor() {
    this.offset = null;
    this.rtt = Infinity;
  }

  hello(serverTime, now) {
    this.offset ??= serverTime - now;
  }

  pong(serverTime, sentAt, now) {
    const rtt = now - sentAt;
    if (rtt >= this.rtt) return;
    this.rtt = rtt;
    this.offset = serverTime - (sentAt + now) / 2;
  }

  toServer(now) {
    return now + (this.offset ?? 0);
  }
}
