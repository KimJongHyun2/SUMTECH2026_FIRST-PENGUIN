import { describe, expect, it } from 'vitest';
import { baselineFrom, classify, createAlertTracker, deltaFrom } from './posture.js';

describe('classify (p1 T1 평균 변화량으로 확인)', () => {
  const cases = [
    ['바른자세', { head_forward: 0, neck_len: 0, pitch_deg: 0 }, 'good'],
    ['의자당김', { head_forward: -0.009, neck_len: -0.002, pitch_deg: -2.3 }, 'good'],
    ['거북목_약', { head_forward: 0.013, neck_len: -0.041, pitch_deg: 6.7 }, 'warn'],
    ['거북목_강', { head_forward: 0.075, neck_len: -0.095, pitch_deg: 9.7 }, 'bad'],
    ['고개숙임', { head_forward: 0.005, neck_len: -0.17, pitch_deg: 31 }, 'bow'],
    ['필기', { head_forward: 0.008, neck_len: -0.126, pitch_deg: 26.3 }, 'bow'],
  ];
  it.each(cases)('%s → %s', (_, delta, expected) => {
    expect(classify(delta)).toBe(expected);
  });

  it('사람이 없으면 away', () => {
    expect(classify(null)).toBe('away');
  });
});

describe('deltaFrom / baselineFrom', () => {
  const s = (hf, nl, pitch, vis = 0.9) => ({ head_forward: hf, neck_len: nl, pitch_deg: pitch, shoulder_vis: vis });

  it('기준은 샘플 평균', () => {
    const base = baselineFrom([s(0.3, 0.7, 0), s(0.32, 0.72, 2)]);
    expect(base.head_forward).toBeCloseTo(0.31);
    expect(base.neck_len).toBeCloseTo(0.71);
    expect(base.pitch_deg).toBeCloseTo(1);
  });

  it('어깨가 대부분 안 보이면 기준을 잡지 않는다', () => {
    expect(baselineFrom([s(0.3, 0.7, 0, 0.1), s(0.3, 0.7, 0, 0.1), s(0.3, 0.7, 0)])).toBeNull();
  });

  it('변화량 = 최근 평균 − 기준, pitch가 비면 그 값만 빼고 평균', () => {
    const base = { head_forward: 0.3, neck_len: 0.7, pitch_deg: 0 };
    const d = deltaFrom([s(0.35, 0.6, 10), s(0.35, 0.6, null)], base);
    expect(d.head_forward).toBeCloseTo(0.05);
    expect(d.neck_len).toBeCloseTo(-0.1);
    expect(d.pitch_deg).toBeCloseTo(10);
  });
});

describe('createAlertTracker', () => {
  const run = (tracker, steps) => steps.map(([t, cls]) => tracker.update(t, cls)).filter(Boolean);

  it('거북목이 30초 이어지면 한 번만 알린다', () => {
    const tr = createAlertTracker();
    const alerts = run(tr, [[0, 'warn'], [10_000, 'warn'], [30_000, 'warn'], [40_000, 'warn']]);
    expect(alerts).toEqual([{ level: 'warn', since: 0 }]);
  });

  it('위험 단계가 30초 이어지면 bad로 알린다', () => {
    const tr = createAlertTracker();
    const alerts = run(tr, [[0, 'bad'], [30_000, 'bad']]);
    expect(alerts).toEqual([{ level: 'bad', since: 0 }]);
  });

  it('잠깐(5초 미만) 바르게 앉았다 돌아가면 시간이 이어진다', () => {
    const tr = createAlertTracker();
    const alerts = run(tr, [[0, 'warn'], [20_000, 'good'], [23_000, 'warn'], [30_000, 'warn']]);
    expect(alerts).toEqual([{ level: 'warn', since: 0 }]);
  });

  it('5초 이상 바른 자세면 초기화되고 다시 알릴 수 있다', () => {
    const tr = createAlertTracker();
    const alerts = run(tr, [
      [0, 'warn'], [30_000, 'warn'],
      [31_000, 'good'], [36_000, 'good'],
      [40_000, 'warn'], [70_000, 'warn'],
    ]);
    expect(alerts.map((a) => a.since)).toEqual([0, 40_000]);
  });

  it('고개 숙임(필기 등)은 90초가 지나야 알린다', () => {
    const tr = createAlertTracker();
    expect(run(tr, [[0, 'bow'], [60_000, 'bow']])).toEqual([]);
    expect(run(tr, [[90_000, 'bow']])).toEqual([{ level: 'bow', since: 0 }]);
  });

  it('자리를 비운 시간은 무시한다', () => {
    const tr = createAlertTracker();
    expect(run(tr, [[0, 'warn'], [10_000, 'away']])).toEqual([]);
  });
});
