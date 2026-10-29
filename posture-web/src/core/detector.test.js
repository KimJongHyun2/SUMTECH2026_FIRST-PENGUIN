import { describe, expect, it } from 'vitest';
import { BaselineCollector, evaluateFrame, frameQuality } from './detector.js';
import { validateSettings } from './policy.js';
import { windowMetrics } from './report.js';

const s = (hf, nl, pitch, vis = 0.9) => ({ head_forward: hf, neck_len: nl, pitch_deg: pitch, ear_vis: vis, shoulder_vis: vis });
const base = { head_forward: 0.33, neck_len: 0.75, pitch_deg: 0 };

describe('frameQuality (F4)', () => {
  it('사람 없음 / 품질 부족 / 유효', () => {
    expect(frameQuality(null)).toBe('away');
    expect(frameQuality(s(0.3, 0.7, 0, 0.2))).toBe('unrecognized');
    expect(frameQuality(s(0.3, 0.7, 0))).toBe('valid');
  });
});

describe('evaluateFrame (p1 T1 평균 변화량)', () => {
  it.each([
    ['바른자세', s(0.33, 0.75, 0), false],
    ['의자당김', s(0.321, 0.748, -2.3), false],
    ['거북목_약', s(0.343, 0.709, 6.7), true],
    ['거북목_강', s(0.405, 0.655, 9.7), true],
    ['고개숙임', s(0.335, 0.58, 31), true],
  ])('%s → 이탈 %s', (_, sample, deviated) => {
    expect(evaluateFrame(sample, base).deviated).toBe(deviated);
  });

  it('민감도가 낮으면 같은 변화도 이탈로 보지 않을 수 있다', () => {
    const weak = s(0.33, 0.709, 0);
    expect(evaluateFrame(weak, base, 'normal').deviated).toBe(true);
    expect(evaluateFrame(weak, base, 'low').deviated).toBe(false);
  });

  it('유효하지 않은 입력은 판정하지 않는다', () => {
    expect(evaluateFrame(null, base)).toEqual({ quality: 'away', deviated: false, types: [] });
  });
});

describe('BaselineCollector (F1)', () => {
  it('안정 입력 5초가 이어지면 기준을 만든다', () => {
    const c = new BaselineCollector();
    let r;
    for (let t = 0; t <= 5000; t += 500) r = c.push(t, s(0.33, 0.75, 1));
    expect(r.status).toBe('done');
    expect(r.baseline.head_forward).toBeCloseTo(0.33);
  });

  it('중간에 인식이 끊기면 처음부터 다시 모은다', () => {
    const c = new BaselineCollector();
    for (let t = 0; t <= 3000; t += 500) c.push(t, s(0.33, 0.75, 1));
    expect(c.push(3500, null).status).toBe('restarted');
    let r;
    for (let t = 4000; t <= 8500; t += 500) r = c.push(t, s(0.33, 0.75, 1));
    expect(r.status).toBe('collecting');
    r = c.push(9000, s(0.33, 0.75, 1));
    expect(r.status).toBe('done');
    expect(c.restarts).toBe(1);
  });

  it('크게 움직이면 다시 모은다', () => {
    const c = new BaselineCollector();
    c.push(0, s(0.33, 0.75, 0));
    expect(c.push(500, s(0.40, 0.75, 0)).status).toBe('restarted');
  });
});

describe('validateSettings (F5)', () => {
  it('정수 범위 안이면 통과', () => {
    const r = validateSettings({ sensitivity: 'high', warningSeconds: '12', rewarningSeconds: '60', sound: false });
    expect(r).toEqual({ ok: true, settings: { sensitivity: 'high', warningSeconds: 12, rewarningSeconds: 60, sound: false } });
  });

  it.each([['0'], ['301'], ['1.5'], [''], ['abc']])('경고 시간 %s는 저장하지 않고 이유를 준다', (value) => {
    const r = validateSettings({ sensitivity: 'normal', warningSeconds: value, rewarningSeconds: '60' });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('경고 시간은 1~300');
  });

  it('재경고 간격 범위 10~600', () => {
    expect(validateSettings({ sensitivity: 'normal', warningSeconds: '10', rewarningSeconds: '9' }).ok).toBe(false);
    expect(validateSettings({ sensitivity: 'normal', warningSeconds: '10', rewarningSeconds: '600' }).ok).toBe(true);
  });
});

describe('windowMetrics (report-contract C01·C02 대응)', () => {
  it('구간과 겹치는 부분만 이탈 시간으로 세고, 끝난 이유별로 복귀·중단을 나눈다', () => {
    const ledger = {
      validNow: 90000,
      candidate: null,
      warnings: [{ kind: 'first', valid: 20000 }, { kind: 'rewarning', valid: 80000 }],
      events: [
        { id: 'a', onsetValid: 10000, endValid: 30000, endReason: 'normal_return', types: [] },
        { id: 'b', onsetValid: 50000, endValid: 65000, endReason: 'away', types: [] },
      ],
    };
    const m = windowMetrics(ledger, 0, 60000);
    expect(m).toMatchObject({ validSeconds: 60, deviationSeconds: 30, newEvents: 2, normalReturns: 1, interruptions: 0, firstWarnings: 1 });
    expect(m.ratio).toBeCloseTo(0.5);
    const rest = windowMetrics(ledger, 60000, 90000);
    expect(rest).toMatchObject({ deviationSeconds: 5, newEvents: 0, continuedEvents: 1, interruptions: 1, rewarnings: 1 });
  });
});
