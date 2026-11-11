import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import { compareSessions, NOT_COMPARABLE, NOT_ENOUGH, sessionConditions } from './compare.js';
import { MODEL_VERSION } from './detector.js';
import { SessionEngine } from './engine.js';
import { DEFAULT_SETTINGS } from './policy.js';
import { openStore } from './store.js';

let store;

beforeEach(async () => {
  store = await openStore(new IDBFactory());
});

const baseline = (id, createdAt = 1) => ({ id, createdAt, features: { head_forward: 0.33, neck_len: 0.75, pitch_deg: 0 }, modelVersion: 'test', kind: 'front' });

const CAMERA = { label: 'FaceTime HD Camera', width: 640, height: 480 };

function finishedSession(id, {
  baselineId = 'b1', settingsVersionId = 'c1', goodSeconds = 10, badSeconds = 0, conditions = sessionConditions(CAMERA),
} = {}) {
  const engine = new SessionEngine({ id, startedAt: 0, baselineId, settingsVersionId, settings: DEFAULT_SETTINGS, conditions });
  engine.start(0);
  let t = 0;
  for (; t < goodSeconds * 1000; t += 500) engine.tick(t + 500, { quality: 'valid', deviated: false });
  for (let i = 0; i < badSeconds * 1000; i += 500) { t += 500; engine.tick(t, { quality: 'valid', deviated: true }); }
  engine.end(t);
  return engine;
}

describe('기준·설정 (F1·F5)', () => {
  it('기준은 불변으로 쌓이고 마지막 등록이 현재 기준이다', async () => {
    await store.addBaseline(baseline('b1'));
    await store.addBaseline(baseline('b2', 2));
    expect((await store.currentBaseline()).id).toBe('b2');
    expect(await store.listBaselines()).toHaveLength(2);
    await expect(store.addBaseline(baseline('b1'))).rejects.toThrow();
  });

  it('서로 다른 탭에서 기준과 설정을 동시에 저장해도 두 현재 참조를 보존한다', async () => {
    const factory = new IDBFactory();
    const first = await openStore(factory);
    const second = await openStore(factory);
    try {
      await Promise.all([
        first.addBaseline(baseline('parallel-baseline')),
        second.addSettingsVersion({ id: 'parallel-settings', appliedAt: 1, settings: DEFAULT_SETTINGS }),
      ]);
      expect((await first.currentBaseline())?.id).toBe('parallel-baseline');
      expect((await second.currentSettings())?.id).toBe('parallel-settings');
      expect((await second.currentBaseline())?.id).toBe('parallel-baseline');
      expect((await first.currentSettings())?.id).toBe('parallel-settings');
    } finally {
      first.close();
      second.close();
    }
  });

  it('설정 버전도 불변으로 쌓이고 현재 버전을 기억한다', async () => {
    await store.addSettingsVersion({ id: 'c1', appliedAt: 1, settings: DEFAULT_SETTINGS });
    await store.addSettingsVersion({ id: 'c2', appliedAt: 2, settings: { ...DEFAULT_SETTINGS, warningSeconds: 12 } });
    expect((await store.currentSettings()).settings.warningSeconds).toBe(12);
    expect(await store.listSettingsVersions()).toHaveLength(2);
  });
});

describe('세션 저장·삭제 (F3·F7)', () => {
  it('세션은 원장·리포트와 함께 저장되고 최신순으로 조회된다', async () => {
    await store.saveSession(finishedSession('s1'), 100);
    const later = finishedSession('s2');
    later.startedAt = 50;
    await store.saveSession(later, 200);
    const list = await store.listSessions();
    expect(list.map((s) => s.id)).toEqual(['s2', 's1']);
    expect(list[1].engine.reports[0].kind).toBe('final');
  });

  it('삭제는 세션을 지우고 현재 기준은 남긴다 (S7)', async () => {
    await store.addBaseline(baseline('b1'));
    await store.saveSession(finishedSession('s1'), 100);
    expect(await store.deleteSession('s1')).toBe(true);
    expect(await store.listSessions()).toEqual([]);
    expect((await store.currentBaseline()).id).toBe('b1');
  });

  it('현재 기준이 아니고 다른 세션도 쓰지 않는 기준만 함께 정리한다', async () => {
    await store.addBaseline(baseline('old'));
    await store.addBaseline(baseline('shared', 2));
    await store.addBaseline(baseline('current', 3));
    await store.saveSession(finishedSession('s1', { baselineId: 'old' }), 1);
    await store.saveSession(finishedSession('s2', { baselineId: 'shared' }), 1);
    await store.saveSession(finishedSession('s3', { baselineId: 'shared' }), 1);
    await store.deleteSession('s1');
    await store.deleteSession('s2');
    const ids = (await store.listBaselines()).map((b) => b.id).sort();
    expect(ids).toEqual(['current', 'shared']);
  });

  it('진행 중인 세션은 지우지 않는다', async () => {
    const engine = new SessionEngine({ id: 'live', startedAt: 0, baselineId: 'b1', settingsVersionId: 'c1', settings: DEFAULT_SETTINGS });
    engine.start(0);
    await store.saveSession(engine, 1);
    await expect(store.deleteSession('live')).rejects.toThrow('종료한 뒤');
  });

  it('새로고침으로 끝나지 않은 세션은 마지막 저장 구간까지만 중단 세션으로 남긴다', async () => {
    const engine = new SessionEngine({ id: 'live', startedAt: 0, baselineId: 'b1', settingsVersionId: 'c1', settings: DEFAULT_SETTINGS });
    engine.start(0);
    for (let t = 500; t <= 8000; t += 500) engine.tick(t, { quality: 'valid', deviated: false });
    await store.saveSession(engine, 8000);
    expect(await store.closeUnfinished()).toBe(1);
    const saved = await store.getSession('live');
    expect(saved.state).toBe('ended');
    expect(saved.engine.endReason).toBe('interrupted');
    expect(saved.engine.reports[0].metrics.validSeconds).toBe(8);
  });

  it('전체 삭제는 기준·설정 포함 여부를 고를 수 있다', async () => {
    await store.addBaseline(baseline('b1'));
    await store.addSettingsVersion({ id: 'c1', appliedAt: 1, settings: DEFAULT_SETTINGS });
    await store.saveSession(finishedSession('s1'), 1);
    await store.deleteAll();
    expect(await store.listSessions()).toEqual([]);
    expect(await store.currentBaseline()).not.toBeNull();
    await store.deleteAll({ includeBaselineAndSettings: true });
    expect(await store.currentBaseline()).toBeNull();
    expect(await store.currentSettings()).toBeNull();
  });
});

describe('조건부 비교 (F7)', () => {
  const record = (engine) => ({ engine: JSON.parse(JSON.stringify(engine)) });

  it('이전 기록이 없거나 유효 시간이 없으면 자료 부족', () => {
    expect(compareSessions(record(finishedSession('a')), null).message).toBe(NOT_ENOUGH);
    expect(compareSessions(record(finishedSession('a')), record(finishedSession('b', { goodSeconds: 0 }))).message).toBe(NOT_ENOUGH);
  });

  it('기준·설정이 다르면 비교하지 않는다', () => {
    const a = record(finishedSession('a', { baselineId: 'b1' }));
    const b = record(finishedSession('b', { baselineId: 'b2' }));
    expect(compareSessions(a, b)).toEqual({ comparable: false, message: NOT_COMPARABLE });
  });

  it('배치(카메라 장치·해상도)가 다르면 비교하지 않는다', () => {
    const a = record(finishedSession('a'));
    const b = record(finishedSession('b', { conditions: sessionConditions({ ...CAMERA, label: 'USB Webcam' }) }));
    const c = record(finishedSession('c', { conditions: sessionConditions({ ...CAMERA, width: 1280, height: 720 }) }));
    expect(compareSessions(a, b).message).toBe(NOT_COMPARABLE);
    expect(compareSessions(a, c).message).toBe(NOT_COMPARABLE);
  });

  it('지표 조건(판정 경계·모델·집계 정의)이 다르면 비교하지 않는다', () => {
    const base = sessionConditions(CAMERA);
    const a = record(finishedSession('a'));
    const b = record(finishedSession('b', { conditions: { ...base, metric: { ...base.metric, model: 'other-model' } } }));
    expect(compareSessions(a, b).message).toBe(NOT_COMPARABLE);
  });

  it.each([null, undefined, {}, { metric: null }, { placement: null }])('누락된 구형 조건 %j은 기본 조건으로 비교한다', (conditions) => {
    const a = record(finishedSession('a', { goodSeconds: 10, badSeconds: 10 }));
    const old = record(finishedSession('b'));
    old.engine.conditions = conditions;
    const result = compareSessions(a, old);
    expect(result.comparable).toBe(true);
    expect(result.ratioChange).toBeCloseTo(0.5);
    expect(compareSessions(old, a).comparable).toBe(true);
  });

  it('양쪽 구형 기록의 조건이 모두 없어도 기본 조건으로 비교한다', () => {
    const a = record(finishedSession('a', { conditions: null }));
    const b = record(finishedSession('b', { conditions: null }));
    delete b.engine.conditions;
    expect(compareSessions(a, b).comparable).toBe(true);
  });

  it('구형 지표는 기본 지표이며 명시적으로 다른 모델과 비교하지 않는다', () => {
    const old = record(finishedSession('old', { conditions: null }));
    const changed = record(finishedSession('new'));
    changed.engine.conditions.metric.model = 'other-model';
    expect(compareSessions(changed, old).message).toBe(NOT_COMPARABLE);
  });

  it('조건 일부가 없어도 남아 있는 명시적 배치 차이는 비교하지 않는다', () => {
    const a = record(finishedSession('a'));
    const b = record(finishedSession('b', { conditions: sessionConditions({ ...CAMERA, label: 'USB Webcam' }) }));
    delete b.engine.conditions.metric;
    expect(compareSessions(a, b).message).toBe(NOT_COMPARABLE);
  });

  it('구형 조건이라도 세션 중 조건이 바뀌면 비교하지 않는다', () => {
    const a = record(finishedSession('a'));
    const old = record(finishedSession('b', { conditions: null }));
    old.engine.segments.push({ ...old.engine.segments[0] });
    expect(compareSessions(a, old).message).toBe(NOT_COMPARABLE);
  });

  it('세션 조건은 지표(모델·판정 경계·집계 정의)와 배치(카메라)를 남긴다', () => {
    const c = sessionConditions(CAMERA);
    expect(c.metric.model).toBe(MODEL_VERSION);
    expect(c.metric).toHaveProperty('limits');
    expect(c.placement).toEqual({ camera: 'FaceTime HD Camera', width: 640, height: 480 });
  });

  it('같은 조건이면 이탈 비율 변화를 계산한다', () => {
    const a = record(finishedSession('a', { goodSeconds: 10, badSeconds: 10 }));
    const b = record(finishedSession('b', { goodSeconds: 20 }));
    const r = compareSessions(a, b);
    expect(r.comparable).toBe(true);
    expect(r.previous.ratio).toBe(0);
    expect(r.current.ratio).toBeCloseTo(0.5);
  });
});
