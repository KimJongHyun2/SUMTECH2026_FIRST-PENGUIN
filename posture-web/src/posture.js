// 서비스용 자세 판정. 각도 보정(T3)이 검증되기 전이라 정면 신호의 "바른 자세 기준 대비 변화량"으로 판정한다.
// 초기값은 p1 T1 데이터에서 잡았다 (거북목_약 Δ목길이 −0.041, 거북목_강 Δ머리내밂 +0.075,
// 고개숙임 Δpitch +31°, 필기 +26°, 거북목 pitch ≤ +10°). 근거: docs/02_판정기준_근거.md
export const LIMITS = {
  bowPitch: 20,
  badHeadForward: 0.05,
  badNeckLen: -0.08,
  warnHeadForward: 0.025,
  warnNeckLen: -0.035,
};

export const SIGNAL_KEYS = ['head_forward', 'neck_len', 'pitch_deg'];

/** @returns 'good' | 'warn' | 'bad' | 'bow' | 'away' */
export function classify(delta, limits = LIMITS) {
  if (!delta) return 'away';
  // 고개 숙임은 목 길이도 크게 줄어서 거북목보다 먼저 가려낸다.
  if (delta.pitch_deg >= limits.bowPitch) return 'bow';
  if (delta.head_forward >= limits.badHeadForward || delta.neck_len <= limits.badNeckLen) return 'bad';
  if (delta.head_forward >= limits.warnHeadForward || delta.neck_len <= limits.warnNeckLen) return 'warn';
  return 'good';
}

/** 최근 샘플 평균에서 기준을 뺀 변화량. pitch를 못 잡은 샘플은 pitch만 빼고 평균 낸다. */
export function deltaFrom(samples, baseline) {
  if (!samples.length || !baseline) return null;
  const delta = {};
  for (const key of SIGNAL_KEYS) {
    const values = samples.map((s) => s[key]).filter((v) => typeof v === 'number');
    delta[key] = values.length ? values.reduce((a, b) => a + b, 0) / values.length - baseline[key] : 0;
  }
  return delta;
}

/** 기준 잡는 동안 모은 샘플의 평균. 어깨가 대부분 안 보였으면 null. */
export function baselineFrom(samples, minVisibleRatio = 0.8) {
  const visible = samples.filter((s) => s.shoulder_vis >= 0.5);
  if (!samples.length || visible.length / samples.length < minVisibleRatio) return null;
  const base = {};
  for (const key of SIGNAL_KEYS) {
    const values = visible.map((s) => s[key]).filter((v) => typeof v === 'number');
    base[key] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }
  return base;
}

/**
 * 나쁜 자세가 일정 시간 이어질 때 한 번만 알림을 낸다. 바른 자세로 recover만큼 돌아오면 초기화.
 * update()는 새 알림이 생기면 { level, since }를, 아니면 null을 돌려준다.
 */
export function createAlertTracker({ hold = 30_000, bowHold = 90_000, recover = 5_000 } = {}) {
  let turtleSince = null;
  let badSince = null;
  let bowSince = null;
  let goodSince = null;
  const fired = new Set();

  const reset = () => {
    turtleSince = badSince = bowSince = null;
    fired.clear();
  };

  return {
    reset,
    update(t, cls) {
      if (cls === 'away') return null;
      if (cls === 'good') {
        goodSince ??= t;
        if (t - goodSince >= recover) reset();
        return null;
      }
      goodSince = null;

      if (cls === 'bow') {
        bowSince ??= t;
        if (t - bowSince >= bowHold && !fired.has('bow')) {
          fired.add('bow');
          return { level: 'bow', since: bowSince };
        }
        return null;
      }

      bowSince = null;
      turtleSince ??= t;
      badSince = cls === 'bad' ? (badSince ?? t) : null;
      if (badSince !== null && t - badSince >= hold && !fired.has('bad')) {
        fired.add('bad');
        return { level: 'bad', since: badSince };
      }
      if (t - turtleSince >= hold && !fired.has('warn') && !fired.has('bad')) {
        fired.add('warn');
        return { level: 'warn', since: turtleSince };
      }
      return null;
    },
  };
}
