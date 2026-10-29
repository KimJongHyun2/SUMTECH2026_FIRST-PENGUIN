import { describe, expect, it } from 'vitest';
import { ClockOffset, DeepBaselineCollector, SIDE_LIMITS, fuseDeep, sideQuality } from './deep.js';

const front = (hf = 0.33) => ({ head_forward: hf, neck_len: 0.75, pitch_deg: 0, ear_vis: 0.9, shoulder_vis: 0.9 });
const side = (t, angleDeg = 80, valid = true) => ({ seq: 0, t, valid, angleDeg: valid ? angleDeg : null, earVis: 0.9, shoulderVis: 0.9 });
const VALID_FRONT = { quality: 'valid', deviated: false, types: [] };

describe('sideQuality (F10 동기화)', () => {
  it('정면 시각과 1초 이내인 유효 측면 입력만 유효로 본다', () => {
    expect(sideQuality(side(10_000), 10_000)).toBe('valid');
    expect(sideQuality(side(9_000), 10_000)).toBe('valid');
    expect(sideQuality(side(8_999), 10_000)).toBe('side_stale');
  });

  it('입력이 없거나 갱신이 멈췄으면 지연, 품질이 낮으면 인식 불가', () => {
    expect(sideQuality(null, 10_000)).toBe('side_stale');
    expect(sideQuality(side(10_000), 10_000, { idle: true })).toBe('side_stale');
    expect(sideQuality(side(10_000, null, false), 10_000)).toBe('side_unrecognized');
  });
});

describe('fuseDeep (F10 통합 판정)', () => {
  const baselineSide = 80;

  it('정면이 무효이면 정면 사유로 보류한다', () => {
    const r = fuseDeep({ quality: 'away', deviated: false, types: [] }, 'valid', side(0), baselineSide);
    expect(r).toEqual({ quality: 'away', deviated: false, types: [] });
  });

  it('측면이 무효이면 정면이 유효해도 전체 판정을 보류한다', () => {
    expect(fuseDeep(VALID_FRONT, 'side_stale', null, baselineSide).quality).toBe('side_stale');
    expect(fuseDeep(VALID_FRONT, 'side_unrecognized', side(0, null, false), baselineSide).quality).toBe('side_unrecognized');
  });

  it('측면 각도가 기준보다 경계 이상 줄면 이탈로 본다', () => {
    const drop = SIDE_LIMITS.angleDrop;
    expect(fuseDeep(VALID_FRONT, 'valid', side(0, 80 - drop + 0.1), baselineSide).deviated).toBe(false);
    const r = fuseDeep(VALID_FRONT, 'valid', side(0, 80 - drop), baselineSide);
    expect(r).toEqual({ quality: 'valid', deviated: true, types: ['side_angle'] });
  });

  it('정면 이탈 유형은 그대로 두고 측면 유형을 더한다', () => {
    const r = fuseDeep({ quality: 'valid', deviated: true, types: ['head_forward'] }, 'valid', side(0, 50), baselineSide);
    expect(r.types).toEqual(['head_forward', 'side_angle']);
  });

  it('민감도 배율을 측면 경계에도 곱한다', () => {
    const angle = 80 - SIDE_LIMITS.angleDrop;
    expect(fuseDeep(VALID_FRONT, 'valid', side(0, angle), baselineSide, 'low').deviated).toBe(false);
    expect(fuseDeep(VALID_FRONT, 'valid', side(0, angle), baselineSide, 'high').deviated).toBe(true);
  });
});

describe('DeepBaselineCollector (F9 양쪽 기준 등록)', () => {
  it('정면·측면이 함께 연속 안정 5초면 두 특징을 합친 기준을 만든다', () => {
    const c = new DeepBaselineCollector();
    let r;
    for (let t = 0; t <= 5000; t += 500) r = c.push(t, front(), 'valid', side(t, 80 + (t % 1000 ? 1 : -1)));
    expect(r.status).toBe('done');
    expect(r.baseline.head_forward).toBeCloseTo(0.33);
    expect(r.baseline.side_angle_deg).toBeCloseTo(80, 0);
  });

  it('4.5초에서 측면이 끊기면 처음부터 다시 센다', () => {
    const c = new DeepBaselineCollector();
    for (let t = 0; t <= 4500; t += 500) c.push(t, front(), 'valid', side(t));
    const r = c.push(5000, front(), 'side_stale', null);
    expect(r).toMatchObject({ status: 'restarted', reason: 'side_stale' });
    expect(c.restarts).toBe(1);
  });

  it('측면 각도가 안정 범위를 넘게 흔들리면 처음부터 다시 센다', () => {
    const c = new DeepBaselineCollector();
    for (let t = 0; t <= 2000; t += 500) c.push(t, front(), 'valid', side(t, 80));
    const r = c.push(2500, front(), 'valid', side(2500, 80 + SIDE_LIMITS.stableRange + 1));
    expect(r).toMatchObject({ status: 'restarted', reason: 'side_unstable' });
  });

  it('정면이 끊기면 측면 각도도 함께 버린다', () => {
    const c = new DeepBaselineCollector();
    for (let t = 0; t <= 2000; t += 500) c.push(t, front(), 'valid', side(t, 60));
    expect(c.push(2500, null, 'valid', side(2500, 60))).toMatchObject({ status: 'restarted', reason: 'front' });
    let r;
    for (let t = 3000; t <= 8000; t += 500) r = c.push(t, front(), 'valid', side(t, 80));
    expect(r.status).toBe('done');
    expect(r.baseline.side_angle_deg).toBeCloseTo(80);
  });
});

describe('ClockOffset (서버 시각 보정)', () => {
  it('hello로 첫 차이를 잡고, 왕복이 가장 짧은 pong으로 고친다', () => {
    const clock = new ClockOffset();
    expect(clock.toServer(1000)).toBe(1000);
    clock.hello(5000, 1000);
    expect(clock.toServer(1000)).toBe(5000);
    clock.pong(5100, 1000, 1200); // 왕복 200ms → 중간 시점 1100이 서버 5100
    expect(clock.toServer(1100)).toBe(5100);
    clock.pong(9999, 2000, 2600); // 더 긴 왕복은 무시
    expect(clock.toServer(1100)).toBe(5100);
  });
});
