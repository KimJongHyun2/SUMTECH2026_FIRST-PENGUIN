// 이전 기록과 비교 (F7). 모드·기준·설정이 같고 세션 중 변경이 없을 때만 정량 비교한다.
// 조건이 다르면 비교하지 않으며, 재등록을 피하도록 유도하지 않는다.
export const NOT_COMPARABLE = '조건이 달라 비교할 수 없어요';
export const NOT_ENOUGH = '비교할 기록이 부족해요';

function totals(session) {
  const reports = session.engine.reports;
  const valid = reports.reduce((a, r) => a + r.metrics.validSeconds, 0);
  const deviation = reports.reduce((a, r) => a + r.metrics.deviationSeconds, 0);
  return { valid, deviation, ratio: valid > 0 ? deviation / valid : null };
}

function condition(session) {
  const segments = session.engine.segments;
  if (segments.length !== 1) return null; // 세션 중 설정·기준·모드가 바뀌면 한 조건으로 볼 수 없다
  const [seg] = segments;
  return `${seg.mode}|${seg.baselineId}|${seg.settingsVersionId}`;
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
