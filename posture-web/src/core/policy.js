// 운영 기본값 (docs/prd.md 3절). 기획 확정 기본값이며 건강 효과·감지 성능은 미검증이다.
export const POLICY = Object.freeze({
  baselineStableSeconds: 5,
  deviationSeconds: 10,
  recoverySeconds: 3,
  rewarningSeconds: 60,
  reportValidSeconds: 1800,
  // PRD F1·F2·F4: 입력이 무효이면 즉시 연속성을 초기화한다(0 = 유예 없음).
  // 짧은 가림을 봐주는 유예는 미채택 파일럿이며, 양수로 바꾸면 이 시간 이하의 인식 끊김을 넘긴다.
  recognitionGraceSeconds: 0,
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

/**
 * 시간은 숫자로 바꾸고 밀리초로 환산한 뒤에도 유한하고 안전한 양의 정수여야 한다 (docs/prd.md 5절).
 * 0·소수·음수·빈 값과, 안전한 정수 범위를 넘거나 Infinity가 되는 큰 수는 저장하지 않는다.
 * 제품의 시간 설정 상한은 기획에서 미확정이라 두지 않는다.
 */
export function validateSettings(input) {
  const errors = {};
  const settings = {};
  for (const key of TIME_KEYS) {
    const raw = String(input[key] ?? '').trim();
    const seconds = Number(raw);
    const usable = /^\d+$/.test(raw) && Number.isSafeInteger(seconds) && seconds >= 1
      && Number.isSafeInteger(seconds * 1000);
    if (usable) settings[key] = seconds;
    else errors[key] = POSITIVE_INTEGER_ERROR;
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
