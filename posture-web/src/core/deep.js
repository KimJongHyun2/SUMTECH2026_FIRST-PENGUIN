// 딥 모드 판정 (F9·F10, docs/prd.md 6절): PC 정면 판정에 휴대폰 측면 입력을 결합한다.
// 정면·측면이 모두 유효하고 측면 입력이 충분히 최근일 때만 결합하고, 한쪽이라도 무효이면 전체 판정을 보류한다.
import { BaselineCollector } from './detector.js';
import { CONNECTION_PILOT, SENSITIVITY } from './policy.js';

// 귀–어깨 각도가 측면 기준보다 이만큼 작아지면(머리가 앞으로) 이탈로 본다. 실측 전 파일럿 값이다.
export const SIDE_LIMIT_DEG = 8;
const SIDE_STABLE_DEG = SIDE_LIMIT_DEG / 2;
const MIN_VISIBILITY = 0.5;
// 정면 입력과 결합할 수 있는 측면 입력의 최대 나이 (동기화 허용 오차, 파일럿)
export const SIDE_MAX_AGE_MS = CONNECTION_PILOT.sideMaxAgeSeconds * 1000;

const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

/** 결합할 수 있는 측면 입력인지: 유효·품질·나이(서버 시각 기준 ms) */
export function sideUsable(side, serverNow) {
  return Boolean(side?.valid && side.earVis >= MIN_VISIBILITY && side.shoulderVis >= MIN_VISIBILITY
    && serverNow - side.t <= SIDE_MAX_AGE_MS);
}

/**
 * 정면 판정 결과(evaluateFrame)에 측면 입력을 더한다.
 * @param sideBaseline { angle_deg } 딥 기준 등록 때의 측면 각도
 */
export function evaluateDeep(front, side, sideBaseline, serverNow, sensitivity = 'normal') {
  if (front.quality !== 'valid') return front;
  if (!sideUsable(side, serverNow)) return { quality: 'unrecognized', deviated: false, types: [] };
  const k = SENSITIVITY[sensitivity]?.scale ?? 1;
  const types = [...front.types];
  if (sideBaseline.angle_deg - side.angleDeg >= SIDE_LIMIT_DEG * k) types.push('side_angle');
  return { quality: 'valid', deviated: types.length > 0, types };
}

/**
 * 딥 기준 등록: 정면·측면 필수 입력이 함께 연속 안정 5초여야 한다.
 * 측면이 무효이면 정면도 무효로 보고(짧은 끊김 유예는 정면과 같다), 측면 각도가 흔들리면 처음부터 다시 센다.
 */
export class DeepBaselineCollector {
  constructor() {
    this.#reset();
  }

  #reset() {
    this.front = new BaselineCollector();
    this.angles = [];
  }

  push(t, front, side, serverNow) {
    const usable = sideUsable(side, serverNow);
    const result = this.front.push(t, usable ? front : null);
    if (result.status === 'restarted') {
      this.angles = [];
      return result;
    }
    if (!usable) return result;
    if (this.angles.length && Math.abs(side.angleDeg - mean(this.angles)) >= SIDE_STABLE_DEG) {
      this.#reset();
      return { status: 'restarted', progress: 0 };
    }
    this.angles.push(side.angleDeg);
    if (result.status !== 'done') return result;
    return { ...result, side: { angle_deg: mean(this.angles) } };
  }
}
