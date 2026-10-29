// 리포트 구간 집계 (docs/prd.md 4절). 시간 단위는 "유효 입력 누적 ms"다.
// 이탈 이벤트는 한 번에 하나만 열리므로 구간 안 이탈 시간의 합이 곧 합집합이다.

/**
 * @param ledger { events, warnings, candidate, validNow }
 *   events: 확정 이탈 [{ id, onsetValid, endValid|null, endReason, types }]
 *   warnings: [{ eventId, kind: 'first'|'rewarning', valid }]
 *   candidate: 아직 확정되지 않은 후보 { onsetValid } | null
 *   holds: 판정 보류 구간 [{ reason: 'away'|'unrecognized', startAt, validAt }] (확정 이탈 유무와 별개)
 * @param start 구간 시작(포함), end 구간 끝(제외). includeEnd면 끝 시점의 보류도 포함(종료 리포트)
 */
export function windowMetrics({ events, warnings, candidate, validNow, holds = [] }, start, end, { includeEnd = false } = {}) {
  const validEnd = Math.min(end, validNow);
  const validMs = Math.max(0, validEnd - start);
  let deviationMs = 0;
  let newEvents = 0;
  let continuedEvents = 0;
  let normalReturns = 0;
  let interruptions = 0;
  const items = [];

  for (const e of events) {
    const eventEnd = e.endValid ?? validNow;
    const overlap = Math.min(eventEnd, validEnd) - Math.max(e.onsetValid, start);
    const startsHere = e.onsetValid >= start && e.onsetValid < end;
    const endsHere = e.endValid !== null && e.endValid > start && e.endValid <= end;
    if (overlap > 0) deviationMs += overlap;
    if (startsHere) newEvents += 1;
    else if (overlap > 0) continuedEvents += 1;
    if (endsHere && e.endReason === 'normal_return') normalReturns += 1;
    else if (endsHere) interruptions += 1;
    if (startsHere || overlap > 0 || endsHere) {
      items.push({ id: e.id, onsetValid: e.onsetValid, endValid: e.endValid, endReason: e.endReason, types: e.types });
    }
  }

  const inWindow = warnings.filter((w) => w.valid >= start && w.valid < end);
  const windowHolds = holds
    .filter((h) => h.validAt >= start && (h.validAt < end || (includeEnd && h.validAt === end)))
    .map((h) => ({ reason: h.reason, startAt: h.startAt }));
  return {
    validSeconds: validMs / 1000,
    deviationSeconds: deviationMs / 1000,
    ratio: validMs > 0 ? deviationMs / validMs : null,
    newEvents,
    continuedEvents,
    firstWarnings: inWindow.filter((w) => w.kind === 'first').length,
    rewarnings: inWindow.filter((w) => w.kind === 'rewarning').length,
    normalReturns,
    interruptions,
    provisional: Boolean(candidate && candidate.onsetValid < end && candidate.onsetValid >= start),
    holds: windowHolds,
    events: items,
  };
}

export const HOLD_REASON_LABELS = {
  away: '자리 비움 · 판정 보류',
  unrecognized: '인식 불가 · 판정 보류',
};

export const END_REASON_LABELS = {
  normal_return: '정상 복귀',
  away: '자리 비움으로 중단',
  unrecognized: '인식 불가로 중단',
  paused: '일시 정지로 중단',
  settings_change: '설정 변경으로 중단',
  baseline_change: '기준 변경으로 중단',
  mode_change: '모드 변경으로 중단',
  disconnected: '연결 끊김으로 중단',
  ended: '세션 종료로 중단',
};
