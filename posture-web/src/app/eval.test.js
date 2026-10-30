import { describe, expect, it } from 'vitest';
import { SessionEngine } from '../core/engine.js';
import { DEFAULT_SETTINGS } from '../core/policy.js';
import { Replay } from './eval.js';

const GOOD = { quality: 'valid', deviated: false };
const BAD = { quality: 'valid', deviated: true, types: ['head_forward'] };

function beginRecovery(kind) {
  const session = new SessionEngine({
    id: 's1', startedAt: 0, baselineId: 'b1', settingsVersionId: 'c1', settings: DEFAULT_SETTINGS,
  });
  session.start(0);
  const replay = new Replay(kind, () => {});
  replay.tick(0, session);
  for (let t = 500; t <= 10000; t += 500) {
    session.tick(t, BAD);
    replay.tick(t, session);
  }
  expect(session.warningActive).toBe(true);
  return { session, replay };
}

describe.each(['front', 'deep'])('%s 녹화 입력 재생', (kind) => {
  it('같은 이탈의 정상 복귀 3초가 확인된 뒤에만 완료한다', () => {
    const { session, replay } = beginRecovery(kind);
    for (let t = 10500; t <= 12500; t += 500) {
      session.tick(t, GOOD);
      replay.tick(t, session);
      expect(replay.status).toBe('running');
    }
    session.tick(13000, GOOD);
    replay.tick(13000, session);
    expect(replay.status).toBe('done');
    expect(session.events[0].endReason).toBe('normal_return');
  });

  it.each(['away', 'unrecognized', 'side_stale'])('%s로 경고가 해제돼도 정상 복귀 완료로 표시하지 않는다', (quality) => {
    const { session, replay } = beginRecovery(kind);
    session.tick(10500, { quality });
    replay.tick(10500, session);
    expect(session.warningActive).toBe(false);
    expect(replay.status).toBe('failed');
    expect(replay.text).toContain('정상 복귀 전에 입력이 중단됐어요');
  });
});
