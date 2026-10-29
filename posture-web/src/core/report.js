// 리포트 구간 집계 (docs/prd.md 4절). 시간 단위는 "유효 입력 누적 ms"다.
// 이탈 이벤트는 한 번에 하나만 열리므로 구간 안 이탈 시간의 합이 곧 합집합이다.

/**
 * @param ledger { events, warnings, candidate, validNow }
 *   events: 확정 이탈 [{ id, onsetValid, endValid|null, endReason, types }]
 *   warnings: [{ eventId, kind: 'first'|'rewarning', valid }]
 *   candidate: 아직 확정되지 않은 후보 { onsetValid } | null
 *   holds: 판정 보류 구간 [{ reason: 'away'|'unrecognized'|'side_stale'|'side_unrecognized', startAt, validAt }] (확정 이탈 유무와 별개)
 * @param start 구간 시작(포함), end 구간 끝(제외). includeEnd면 끝 시점의 보류도 포함(종료 리포트)
 */
export function windowMetrics({ events, warnings, candidate, validNow, holds = [], segments = [] }, start, end, { includeEnd = false } = {}) {
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

  // 자동 리포트는 [start, end), 종료 리포트는 끝 시점에 생긴 경고·보류까지 포함한다.
  const inRange = (v) => v >= start && (v < end || (includeEnd && v === end));
  const inWindow = warnings.filter((w) => inRange(w.valid));
  const windowHolds = holds
    .filter((h) => inRange(h.validAt))
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
    modes: modeMetrics(events, segments, start, validEnd, validNow),
  };
}

/**
 * 모드별 V·D·비율 (docs/prd.md 6절 5). 세션 구간(segments)의 모드로 유효 시간을, 이벤트의 모드로 이탈 시간을 나눈다.
 * 모드 간 비율 차이를 개선 효과로 쓰지 않는다.
 */
function modeMetrics(events, segments, start, validEnd, validNow) {
  const out = {};
  const add = (mode, key, ms) => {
    if (ms <= 0) return;
    out[mode] ??= { validMs: 0, deviationMs: 0 };
    out[mode][key] += ms;
  };
  segments.forEach((seg, i) => {
    const segEnd = segments[i + 1]?.fromValid ?? validNow;
    add(seg.mode, 'validMs', Math.min(segEnd, validEnd) - Math.max(seg.fromValid, start));
  });
  for (const e of events) {
    add(e.mode ?? 'basic', 'deviationMs', Math.min(e.endValid ?? validNow, validEnd) - Math.max(e.onsetValid, start));
  }
  return Object.fromEntries(Object.entries(out).map(([mode, { validMs, deviationMs }]) => [mode, {
    validSeconds: validMs / 1000,
    deviationSeconds: deviationMs / 1000,
    ratio: validMs > 0 ? deviationMs / validMs : null,
  }]));
}

export const HOLD_REASON_LABELS = {
  away: '자리 비움 · 판정 보류',
  unrecognized: '인식 불가 · 판정 보류',
  side_stale: '측면 입력 지연 · 판정 보류',
  side_unrecognized: '측면 인식 불가 · 판정 보류',
};

export const END_REASON_LABELS = {
  normal_return: '정상 복귀',
  away: '자리 비움으로 중단',
  unrecognized: '인식 불가로 중단',
  side_stale: '측면 입력 지연으로 중단',
  side_unrecognized: '측면 인식 불가로 중단',
  paused: '일시 정지로 중단',
  settings_change: '설정 변경으로 중단',
  baseline_change: '기준 변경으로 중단',
  mode_change: '모드 변경으로 중단',
  disconnected: '연결 끊김으로 중단',
  ended: '세션 종료로 중단',
};
