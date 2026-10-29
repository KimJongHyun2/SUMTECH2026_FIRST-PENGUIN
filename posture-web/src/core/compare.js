// 이전 기록과 비교 (F7). 모드·지표·기준·설정·배치가 같고 세션 중 변경이 없을 때만 정량 비교한다 (docs/prd.md 4절).
// 조건이 다르거나 확인할 수 없으면 비교하지 않으며, 재등록을 피하도록 유도하지 않는다.
import { SIDE_LIMITS } from './deep.js';
import { LIMITS, MODEL_VERSION, PLACEMENT } from './detector.js';
import { POLICY } from './policy.js';

// 집계 정의 버전: 이탈 비율 = 확정 이탈 시간(시작~복귀 확인) / 유효 감지 시간. 정의가 바뀌면 올린다.
export const METRIC_VERSION = 'deviation-ratio/1';

export const NOT_COMPARABLE = '조건이 달라 비교할 수 없어요';
export const NOT_ENOUGH = '비교할 기록이 부족해요';

function totals(session) {
  const reports = session.engine.reports;
  const valid = reports.reduce((a, r) => a + r.metrics.validSeconds, 0);
  const deviation = reports.reduce((a, r) => a + r.metrics.deviationSeconds, 0);
  return { valid, deviation, ratio: valid > 0 ? deviation / valid : null };
}

/**
 * 세션 시작 때 남기는 비교 조건.
 * - metric(지표): 집계 정의·모델·판정 경계·연속성 규칙. 같은 자세라도 이 값이 다르면 비율이 달라진다.
 * - placement(배치): 정면 카메라 장치·해상도. 기준 ID가 같아도 다른 카메라로 찍은 기록은 비교하지 않는다.
 * @param camera { label, width, height }
 */
export function sessionConditions(camera) {
  return {
    metric: {
      version: METRIC_VERSION,
      model: MODEL_VERSION,
      limits: { ...LIMITS },
      sideLimits: { ...SIDE_LIMITS },
      placementLimits: { minShoulderWidth: PLACEMENT.minShoulderWidth, sizeRatio: [...PLACEMENT.sizeRatio], maxCenterShift: PLACEMENT.maxCenterShift },
      recoverySeconds: POLICY.recoverySeconds,
      recognitionGraceSeconds: POLICY.recognitionGraceSeconds,
    },
    placement: { camera: camera.label ?? '', width: camera.width, height: camera.height },
  };
}

function condition(session) {
  const { segments, conditions } = session.engine;
  // 세션 중 설정·기준·모드가 바뀌면 한 조건으로 볼 수 없다. 조건을 남기기 전의 기록은 같은지 확인할 수 없다.
  if (segments.length !== 1 || !conditions?.metric || !conditions?.placement) return null;
  const [seg] = segments;
  return JSON.stringify([seg.mode, seg.baselineId, seg.settingsVersionId, conditions.metric, conditions.placement]);
}

/** previous가 없거나 어느 쪽이든 유효 시간이 없으면 자료 부족, 조건이 다르면 비교 불가 */
export function compareSessions(current, previous) {
  if (!previous) return { comparable: false, message: NOT_ENOUGH };
  const a = totals(current);
  const b = totals(previous);
  if (a.ratio === null || b.ratio === null) return { comparable: false, message: NOT_ENOUGH };
  const ca = condition(current);
  if (!ca || ca !== condition(previous)) return { comparable: false, message: NOT_COMPARABLE };
  return { comparable: true, current: a, previous: b, ratioChange: a.ratio - b.ratio };
}
