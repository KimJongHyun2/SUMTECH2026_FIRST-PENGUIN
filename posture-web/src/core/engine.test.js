import { describe, expect, it } from 'vitest';
import { SessionEngine } from './engine.js';
import { DEFAULT_SETTINGS } from './policy.js';

const GOOD = { quality: 'valid', deviated: false };
const BAD = { quality: 'valid', deviated: true, types: ['head_forward'] };
const AWAY = { quality: 'away' };
const STEP = 500;

function newEngine(settings = DEFAULT_SETTINGS) {
  const engine = new SessionEngine({ id: 's1', startedAt: 0, baselineId: 'b1', settingsVersionId: 'c1', settings });
  engine.start(0);
  return engine;
}

/** t부터 seconds 동안 STEP 간격으로 같은 입력을 넣는다. 끝난 시각과 신호를 돌려준다. */
function feed(engine, t, seconds, input) {
  const signals = [];
  const end = t + seconds * 1000;
  let now = t;
  while (now < end) {
    now += STEP;
    signals.push(...engine.tick(now, input));
  }
  return { t: now, signals };
}

const types = (signals) => signals.map((s) => s.type);

describe('경고·복귀 (F2)', () => {
  it('10초 지속 이탈에 경고 1회, 3초 복귀로 해제, 종료 리포트에 집계 (S2)', () => {
    const engine = newEngine();
    let r = feed(engine, 0, 6, GOOD);
    r = feed(engine, r.t, 9.5, BAD);
    expect(types(r.signals)).toEqual([]);
    r = feed(engine, r.t, 0.5, BAD);
    expect(types(r.signals)).toEqual(['warning']);
    expect(engine.warningActive).toBe(true);
    r = feed(engine, r.t, 2.5, GOOD);
    expect(types(r.signals)).toEqual([]);
    r = feed(engine, r.t, 0.5, GOOD);
    expect(types(r.signals)).toEqual(['clear']);

    engine.end(r.t + 1000);
    const [report] = engine.reports;
    expect(report.kind).toBe('final');
    expect(report.metrics).toMatchObject({
      newEvents: 1, firstWarnings: 1, rewarnings: 0, normalReturns: 1, interruptions: 0,
      validSeconds: 19, deviationSeconds: 13,
    });
  });

  it('10초 전에 돌아온 후보는 이탈·경고로 집계하지 않는다', () => {
    const engine = newEngine();
    let r = feed(engine, 0, 9, BAD);
    r = feed(engine, r.t, 5, GOOD);
    engine.end(r.t);
    expect(engine.events).toHaveLength(0);
    expect(engine.reports[0].metrics).toMatchObject({ newEvents: 0, firstWarnings: 0, deviationSeconds: 0 });
  });

  it('같은 이탈이 이어지면 최초 경고 뒤 60초마다 재경고하고 이벤트는 하나다', () => {
    const engine = newEngine();
    const r = feed(engine, 0, 10 + 125, BAD);
    expect(types(r.signals)).toEqual(['warning', 'rewarning', 'rewarning']);
    expect(engine.events).toHaveLength(1);
  });

  it('자리 비움은 이탈을 중단으로 닫고 유효 시간에 넣지 않는다', () => {
    const engine = newEngine();
    let r = feed(engine, 0, 12, BAD);
    r = feed(engine, r.t, 10, AWAY);
    expect(types(r.signals)).toEqual(['clear']);
    expect(engine.validMs).toBe(12000);
    expect(engine.events[0].endReason).toBe('away');
    r = feed(engine, r.t, 3, GOOD);
    engine.end(r.t);
    expect(engine.reports[0].metrics).toMatchObject({ normalReturns: 0, interruptions: 1, validSeconds: 15 });
  });

  it('잠깐(3초 미만) 바르게 앉았다 다시 이탈하면 같은 이벤트가 이어진다', () => {
    const engine = newEngine();
    let r = feed(engine, 0, 12, BAD);
    r = feed(engine, r.t, 2, GOOD);
    r = feed(engine, r.t, 5, BAD);
    expect(engine.events).toHaveLength(1);
    expect(engine.events[0].endValid).toBeNull();
  });
});

describe('세션 상태 (F3·F5·F1)', () => {
  it('일시 정지 동안 유효 시간·경고가 멈추고, 재개는 준비를 거쳐 시작한다', () => {
    const engine = newEngine();
    let r = feed(engine, 0, 5, GOOD);
    engine.pause(r.t);
    r = feed(engine, r.t, 20, BAD);
    expect(engine.validMs).toBe(5000);
    expect(types(r.signals)).toEqual([]);
    engine.prepare(r.t);
    expect(engine.state).toBe('ready');
    r = feed(engine, r.t, 3, GOOD);
    expect(engine.validMs).toBe(5000);
    engine.start(r.t);
    r = feed(engine, r.t, 2, GOOD);
    expect(engine.validMs).toBe(7000);
  });

  it('설정 적용은 진행 이탈을 설정 변경으로 닫고 새 경고 시간을 쓴다 (S8)', () => {
    const engine = newEngine();
    let r = feed(engine, 0, 11, BAD);
    const applied = engine.applySettings(r.t, { ...DEFAULT_SETTINGS, warningSeconds: 12 }, 'c2');
    expect(types(applied)).toEqual(['clear']);
    expect(engine.events[0].endReason).toBe('settings_change');
    expect(engine.currentSegment.settingsVersionId).toBe('c2');
    r = feed(engine, r.t, 11, BAD);
    expect(types(r.signals)).toEqual([]);
    r = feed(engine, r.t, 1, BAD);
    expect(types(r.signals)).toEqual(['warning']);
  });

  it('기준 다시 등록 중에는 판정하지 않고 탐지 재개 전 자동 재개하지 않는다 (S8)', () => {
    const engine = newEngine();
    let r = feed(engine, 0, 5, GOOD);
    engine.beginRebaseline(r.t);
    r = feed(engine, r.t, 15, BAD);
    engine.setBaseline(r.t, 'b2');
    r = feed(engine, r.t, 5, BAD);
    expect(engine.state).toBe('ready');
    expect(engine.validMs).toBe(5000);
    expect(engine.events).toHaveLength(0);
    expect(engine.segments.map((s) => s.baselineId)).toEqual(['b1', 'b2']);
  });

  it('딥 모드 장애는 판정을 멈추고, 기본 모드 전환은 새 구간이다 (F10)', () => {
    const engine = newEngine();
    engine.setMode(0, 'deep');
    let r = feed(engine, 0, 12, BAD);
    expect(types(engine.enterRecovery(r.t))).toEqual(['clear']);
    expect(engine.state).toBe('recovering');
    expect(engine.events[0].endReason).toBe('disconnected');
    r = feed(engine, r.t, 5, GOOD);
    expect(engine.validMs).toBe(12000);
    engine.setMode(r.t, 'basic');
    engine.start(r.t);
    expect(engine.segments.map((s) => s.mode)).toEqual(['basic', 'deep', 'basic']);
  });
});

describe('리포트 (F6, docs/report-contract.md)', () => {
  it('유효 1800초마다 자동 리포트를 만들고 세션은 계속, 종료 시 남은 구간만 부분 리포트 (S3)', () => {
    const engine = newEngine();
    let r = feed(engine, 0, 1800, GOOD);
    expect(types(r.signals)).toEqual(['report']);
    expect(engine.state).toBe('running');
    r = feed(engine, r.t, 5, GOOD);
    engine.end(r.t);
    expect(engine.reports.map((x) => [x.kind, x.metrics.validSeconds])).toEqual([['auto', 1800], ['final', 5]]);
  });

  it('C06 정확한 1800초 경계에서 종료하면 자동 리포트 하나만 남는다', () => {
    const engine = newEngine();
    const r = feed(engine, 0, 1800, GOOD);
    engine.end(r.t);
    expect(engine.reports.map((x) => x.kind)).toEqual(['auto']);
  });

  it('C05 유효 시간이 0이면 비율은 계산 불가', () => {
    const engine = newEngine();
    const r = feed(engine, 0, 10, AWAY);
    engine.end(r.t);
    expect(engine.reports).toHaveLength(1);
    expect(engine.reports[0].kind).toBe('empty');
    expect(engine.reports[0].metrics.ratio).toBeNull();
  });

  it('C03 경계를 넘는 확정 이벤트: 각 구간 10초, 신규 횟수는 첫 구간에만', () => {
    const engine = newEngine();
    let r = feed(engine, 0, 1790, GOOD);
    r = feed(engine, r.t, 20, BAD);
    engine.end(r.t);
    const [first, second] = engine.reports;
    expect(first.metrics).toMatchObject({ deviationSeconds: 10, newEvents: 1, continuedEvents: 0 });
    expect(second.metrics).toMatchObject({ deviationSeconds: 10, newEvents: 0, continuedEvents: 1 });
  });

  it('C04 늦은 확정: 첫 리포트는 잠정 → 같은 ID로 개정, 경고는 다음 구간', () => {
    const engine = newEngine();
    let r = feed(engine, 0, 1795, GOOD);
    r = feed(engine, r.t, 5, BAD);
    const first = engine.reports[0];
    expect(first.revision).toBe(1);
    expect(first.metrics).toMatchObject({ provisional: true, newEvents: 0, deviationSeconds: 0 });
    r = feed(engine, r.t, 10, BAD);
    expect(first.id).toBe('s1-w0');
    expect(first.revision).toBe(2);
    expect(first.metrics).toMatchObject({ provisional: false, newEvents: 1, deviationSeconds: 5, firstWarnings: 0 });
    engine.end(r.t);
    expect(engine.reports[1].metrics).toMatchObject({ deviationSeconds: 10, newEvents: 0, firstWarnings: 1 });
  });

  it('잠정 후보가 기준 미달로 끝나면 잠정 표시를 해제한다', () => {
    const engine = newEngine();
    let r = feed(engine, 0, 1795, GOOD);
    r = feed(engine, r.t, 5, BAD);
    r = feed(engine, r.t, 2, GOOD);
    expect(engine.reports[0].metrics.provisional).toBe(false);
    expect(engine.reports[0].metrics.newEvents).toBe(0);
  });
});

describe('저장·복원', () => {
  it('toJSON/fromJSON 뒤에도 같은 이벤트가 이어진다', () => {
    const engine = newEngine();
    const r = feed(engine, 0, 12, BAD);
    const restored = SessionEngine.fromJSON(JSON.parse(JSON.stringify(engine)));
    expect(restored.warningActive).toBe(true);
    const r2 = feed(restored, r.t, 3, GOOD);
    expect(types(r2.signals)).toEqual(['clear']);
    expect(restored.events[0].endReason).toBe('normal_return');
  });
});
