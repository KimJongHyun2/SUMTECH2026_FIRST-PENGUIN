// 공통 정책값 (docs/planning-policy.yaml). 기획 확정 기본값이며 건강 효과·감지 성능은 미검증이다.
export const POLICY = Object.freeze({
  baselineStableSeconds: 5,
  deviationSeconds: 10,
  recoverySeconds: 3,
  rewarningSeconds: 60,
  reportValidSeconds: 1800,
  // 안경 고쳐 쓰기·머리 넘기기처럼 짧은 가림은 연속 타이머를 초기화하지 않는다(이 시간 이하 인식 끊김).
  // 기획 변경을 가정한 파일럿 값이다. 팀이 planning-policy.yaml·F1·F2·F4를 고치기 전까지 미확정.
  recognitionGraceSeconds: 2,
});

// 딥 모드 연결 시간값은 기획에서 미확정이다(pendingDecisions.connection).
// 구현을 위해 archive/planning-history의 과거 제안값을 임시로 쓰며, 확정 조건으로 표시하지 않는다.
export const CONNECTION_PILOT = Object.freeze({
  qrExpirySeconds: 120,
  heartbeatSeconds: 2,
  disconnectSeconds: 6,
  phoneStopSeconds: 10,
});

export const WARNING_TEXT = '기준 자세에서 벗어난 상태가 지속되고 있습니다. 자세를 확인해 주세요.';

export const DEFAULT_SETTINGS = Object.freeze({
  warningSeconds: POLICY.deviationSeconds,
  rewarningSeconds: POLICY.rewarningSeconds,
});

export const SETTING_LABELS = { warningSeconds: '경고 시간', rewarningSeconds: '재경고 간격' };

export const POSITIVE_INTEGER_ERROR = '양의 정수를 입력해 주세요';

/** 0·소수·음수·빈 값은 저장하지 않는다. 입력 상한은 기획에서 미확정이라 두지 않는다. */
export function validateSettings(input) {
  const errors = {};
  const settings = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const raw = String(input[key] ?? '').trim();
    if (!/^\d+$/.test(raw) || Number(raw) < 1) errors[key] = POSITIVE_INTEGER_ERROR;
    else settings[key] = Number(raw);
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, settings };
}
