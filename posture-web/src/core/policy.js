// 공통 설계값 (docs/planning-policy.yaml). 파일럿 제안값이며 의학적 기준이나 검증된 최적값이 아니다.
export const POLICY = Object.freeze({
  baselineStableSeconds: 5,
  deviationSeconds: 10,
  recoverySeconds: 3,
  rewarningSeconds: 60,
  reportValidSeconds: 1800,
  retentionDays: 30,
  qrExpirySeconds: 120,
  heartbeatSeconds: 2,
  disconnectSeconds: 6,
  phoneStopSeconds: 10,
});

export const WARNING_TEXT = '기준 자세에서 벗어난 상태가 지속되고 있습니다. 자세를 확인해 주세요.';

export const SENSITIVITY_LABELS = { low: '낮음', normal: '보통', high: '높음' };

export const DEFAULT_SETTINGS = Object.freeze({
  sensitivity: 'normal',
  warningSeconds: POLICY.deviationSeconds,
  rewarningSeconds: POLICY.rewarningSeconds,
  sound: true,
});

// 입력 허용 범위 (docs/prd.md 6. 이번 통합의 입력 검증 설계안)
export const SETTING_RANGES = Object.freeze({
  warningSeconds: [1, 300],
  rewarningSeconds: [10, 600],
});

const RANGE_LABELS = { warningSeconds: '경고 시간', rewarningSeconds: '재경고 간격' };

/** 설정 입력을 검사한다. 소수·범위 밖·빈 값은 저장하지 않고 이유를 돌려준다. */
export function validateSettings(input) {
  const errors = [];
  const settings = { ...DEFAULT_SETTINGS };

  if (!(input.sensitivity in SENSITIVITY_LABELS)) errors.push('민감도를 낮음·보통·높음 중에서 골라 주세요.');
  else settings.sensitivity = input.sensitivity;

  for (const [key, [min, max]] of Object.entries(SETTING_RANGES)) {
    const raw = String(input[key] ?? '').trim();
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || value < min || value > max) {
      errors.push(`${RANGE_LABELS[key]}은 ${min}~${max} 사이의 정수(초)로 입력해 주세요.`);
    } else {
      settings[key] = value;
    }
  }
  settings.sound = Boolean(input.sound);
  return errors.length ? { ok: false, errors } : { ok: true, settings };
}
