// 운영 기본값 (docs/prd.md 3절). 기획 확정 기본값이며 건강 효과·감지 성능은 미검증이다.
export const POLICY = Object.freeze({
  baselineStableSeconds: 5,
  deviationSeconds: 10,
  recoverySeconds: 3,
  rewarningSeconds: 60,
  reportValidSeconds: 1800,
  // 안경 고쳐 쓰기·머리 넘기기처럼 짧은 가림은 연속 타이머를 초기화하지 않는다(이 시간 이하 인식 끊김).
  // 기획 변경을 가정한 파일럿 값이다. 팀이 docs/prd.md·F1·F2·F4를 고치기 전까지 미확정.
  recognitionGraceSeconds: 2,
});

// 딥 모드 연결 시간값은 서버와 함께 쓰므로 shared/deep-protocol.js에 둔다(QR 120초만 확정, 나머지는 파일럿).
export { CONNECTION_PILOT } from '../../shared/deep-protocol.js';

export const WARNING_TEXT = '기준 자세에서 벗어난 상태가 지속되고 있습니다. 자세를 확인해 주세요.';

export const DEFAULT_SETTINGS = Object.freeze({
  warningSeconds: POLICY.deviationSeconds,
  rewarningSeconds: POLICY.rewarningSeconds,
  sensitivity: 'normal',
  sound: false,
});

// 민감도는 판정 경계에 곱하는 배율이다. 경계는 실측 전 파일럿 값이다(docs/prd.md 5절 "민감도 경계는 미정").
export const SENSITIVITY = Object.freeze({
  low: { label: '낮음', scale: 1.5 },
  normal: { label: '보통', scale: 1 },
  high: { label: '높음', scale: 0.7 },
});

export const SETTING_LABELS = { warningSeconds: '경고 시간', rewarningSeconds: '재경고 간격', sensitivity: '민감도', sound: '소리' };

export const POSITIVE_INTEGER_ERROR = '양의 정수를 입력해 주세요';

const TIME_KEYS = ['warningSeconds', 'rewarningSeconds'];

/** 예전에 저장된 설정(시간 값만 있음)도 기본 민감도·소리로 채워 쓴다. */
export const withDefaults = (settings) => ({ ...DEFAULT_SETTINGS, ...settings });

/** 0·소수·음수·빈 값은 저장하지 않는다. 입력 상한은 기획에서 미확정이라 두지 않는다. */
export function validateSettings(input) {
  const errors = {};
  const settings = {};
  for (const key of TIME_KEYS) {
    const raw = String(input[key] ?? '').trim();
    if (!/^\d+$/.test(raw) || Number(raw) < 1) errors[key] = POSITIVE_INTEGER_ERROR;
    else settings[key] = Number(raw);
  }
  settings.sensitivity = SENSITIVITY[input.sensitivity] ? input.sensitivity : DEFAULT_SETTINGS.sensitivity;
  settings.sound = Boolean(input.sound);
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, settings };
}

/** 값이 실제로 바뀌었는지. 같은 값 재적용은 새 버전·구간을 만들지 않는다 (docs/prd.md 5절). */
export function sameSettings(a, b) {
  const x = withDefaults(a);
  const y = withDefaults(b);
  return Object.keys(DEFAULT_SETTINGS).every((key) => x[key] === y[key]);
}
