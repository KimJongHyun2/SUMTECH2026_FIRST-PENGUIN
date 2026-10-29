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

  const at = (shoulder_w, center_x = 0.52, center_y = 0.77) => ({ ...s(0.33, 0.75, 0), shoulder_w, center_x, center_y });
  const placement = { shoulder_w: 0.43, center_x: 0.52, center_y: 0.77 };

  it('자리를 비웠을 때 뒤쪽에서 작게 잡힌 다른 사람은 자리 비움 (p1 녹화: 0.01)', () => {
    expect(frameQuality(at(0.011, 0.75, 0.8))).toBe('away');
    expect(frameQuality(at(0.011, 0.75, 0.8), placement)).toBe('away');
  });

  it('기준 등록 때와 같은 자리·크기면 유효, 이탈로 가까워진 정도(p1: 0.50)도 유효', () => {
    expect(frameQuality(at(0.43), placement)).toBe('valid');
    expect(frameQuality(at(0.497, 0.54, 0.76), placement)).toBe('valid');
  });

  it('크기나 위치가 기준과 크게 다르면 인식 불가', () => {
    expect(frameQuality(at(0.2), placement)).toBe('unrecognized');
    expect(frameQuality(at(0.43, 0.85), placement)).toBe('unrecognized');
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

  it('짧게(2초 이하) 가려지면 멈췄다가 이어서 센다 — 끊긴 시간은 넣지 않는다', () => {
    const c = new BaselineCollector();
    for (let t = 0; t <= 3000; t += 500) c.push(t, s(0.33, 0.75, 1));
    expect(c.push(3500, null).status).toBe('paused');
    expect(c.push(4500, null).status).toBe('paused');
    let r;
    for (let t = 5000; t <= 6500; t += 500) r = c.push(t, s(0.33, 0.75, 1));
    expect(r.status).toBe('collecting');
    r = c.push(7000, s(0.33, 0.75, 1));
    expect(r.status).toBe('done');
    expect(c.restarts).toBe(0);
  });

  it('2초보다 길게 인식이 끊기면 처음부터 다시 모은다', () => {
    const c = new BaselineCollector();
    for (let t = 0; t <= 3000; t += 500) c.push(t, s(0.33, 0.75, 1));
    expect(c.push(3500, null).status).toBe('paused');
    expect(c.push(5600, null).status).toBe('restarted');
    let r;
    for (let t = 6000; t <= 10500; t += 500) r = c.push(t, s(0.33, 0.75, 1));
    expect(r.status).toBe('collecting');
    r = c.push(11000, s(0.33, 0.75, 1));
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
  it('양의 정수면 통과 (입력 상한은 미확정이라 두지 않는다)', () => {
    expect(validateSettings({ warningSeconds: '12', rewarningSeconds: '600' }))
      .toEqual({ ok: true, settings: { warningSeconds: 12, rewarningSeconds: 600 } });
    expect(validateSettings({ warningSeconds: '1000', rewarningSeconds: '1' }).ok).toBe(true);
  });

  it.each([['0'], ['-1'], ['1.5'], [''], ['abc']])('경고 시간 %s는 저장하지 않고 이유를 준다 (S8)', (value) => {
    const r = validateSettings({ warningSeconds: value, rewarningSeconds: '60' });
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual({ warningSeconds: '양의 정수를 입력해 주세요' });
  });
});

describe('windowMetrics (PRD 4절·가상 산술 C01·C02 대응)', () => {
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
