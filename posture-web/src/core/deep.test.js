import { describe, expect, it } from 'vitest';
import { DeepBaselineCollector, SIDE_LIMIT_DEG, evaluateDeep, sideUsable } from './deep.js';

const NOW = 1_000_000;
const side = (angleDeg, extra = {}) => ({ t: NOW, valid: true, angleDeg, earVis: 0.9, shoulderVis: 0.9, ...extra });
const front = (deviated = false) => ({ quality: 'valid', deviated, types: deviated ? ['head_forward'] : [] });
const sample = { head_forward: 0.33, neck_len: 0.75, pitch_deg: 0, ear_vis: 0.9, shoulder_vis: 0.9 };

describe('측면 입력 결합 (F10)', () => {
  it('측면 입력이 1초보다 오래되거나 무효·품질 부족이면 결합하지 않는다', () => {
    expect(sideUsable(side(75), NOW + 1000)).toBe(true);
    expect(sideUsable(side(75), NOW + 1001)).toBe(false);
    expect(sideUsable(side(null, { valid: false }), NOW)).toBe(false);
    expect(sideUsable(side(75, { earVis: 0.3 }), NOW)).toBe(false);
    expect(sideUsable(null, NOW)).toBe(false);
  });

  it('한쪽이라도 무효이면 전체 판정을 보류한다', () => {
    expect(evaluateDeep(front(), null, { angle_deg: 75 }, NOW).quality).toBe('unrecognized');
    const away = { quality: 'away', deviated: false, types: [] };
    expect(evaluateDeep(away, side(75), { angle_deg: 75 }, NOW)).toBe(away);
  });

  it('측면 각도가 기준보다 8도 이상 작아지면 이탈, 정면 이탈과 유형을 합친다', () => {
    const base = { angle_deg: 75 };
    expect(evaluateDeep(front(), side(75 - SIDE_LIMIT_DEG + 0.5), base, NOW).deviated).toBe(false);
    expect(evaluateDeep(front(), side(75 - SIDE_LIMIT_DEG), base, NOW).types).toEqual(['side_angle']);
    expect(evaluateDeep(front(true), side(60), base, NOW).types).toEqual(['head_forward', 'side_angle']);
    expect(evaluateDeep(front(true), side(75), base, NOW)).toEqual(front(true));
  });
});

describe('딥 기준 등록 (F9)', () => {
  it('정면·측면이 함께 안정 5초여야 등록하고 측면 기준 각도를 남긴다', () => {
    const c = new DeepBaselineCollector();
    let r;
    for (let t = 0; t <= 5000; t += 500) r = c.push(t, sample, side(75 + (t % 1000 ? 0.4 : -0.4), { t }), t);
    expect(r.status).toBe('done');
    expect(r.side.angle_deg).toBeCloseTo(75, 0);
    expect(r.baseline.head_forward).toBeCloseTo(0.33);
  });

  it('측면 입력이 끊기면 정면도 무효로 보고, 2초를 넘으면 처음부터 다시 센다', () => {
    const c = new DeepBaselineCollector();
    for (let t = 0; t <= 3000; t += 500) c.push(t, sample, side(75, { t }), t);
    expect(c.push(3500, sample, null, 3500).status).toBe('paused');
    expect(c.push(6000, sample, null, 6000).status).toBe('restarted');
  });

  it('측면 각도가 크게 흔들리면 처음부터 다시 센다', () => {
    const c = new DeepBaselineCollector();
    for (let t = 0; t <= 2000; t += 500) c.push(t, sample, side(75, { t }), t);
    expect(c.push(2500, sample, side(70, { t: 2500 }), 2500).status).toBe('restarted');
  });
});
