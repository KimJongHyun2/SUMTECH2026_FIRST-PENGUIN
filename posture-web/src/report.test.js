import { describe, expect, it } from 'vitest';
import { addTime, dayKey, emptyDay, loadDay, markSlouch, saveDay, startSession, summarize } from './report.js';

const at = (h, m = 0) => new Date(2026, 9, 30, h, m).getTime();

describe('report', () => {
  it('날짜 키', () => {
    expect(dayKey(at(9))).toBe('2026-10-30');
  });

  it('시간대별로 상태 시간을 모으고 요약한다', () => {
    const day = emptyDay();
    addTime(day, at(14), 'good', 30 * 60_000);
    addTime(day, at(14, 30), 'warn', 10 * 60_000);
    addTime(day, at(15), 'bad', 10 * 60_000);
    addTime(day, at(15), 'bow', 10 * 60_000);
    addTime(day, at(15), 'away', 99 * 60_000); // 자리 비움은 세지 않음

    const s = summarize(day);
    expect(s.minutes).toBe(60);
    expect(s.goodRatio).toBe(0.5);
    expect(s.turtleMinutes).toBe(20);
    expect(s.bowMinutes).toBe(10);
    expect(s.hourly).toEqual([
      { hour: 14, minutes: 40, goodRatio: 0.75 },
      { hour: 15, minutes: 20, goodRatio: 0 },
    ]);
  });

  it('앉은 뒤 처음 무너지기까지의 평균 (세션당 첫 번째만)', () => {
    const day = emptyDay();
    startSession(day, at(9));
    markSlouch(day, at(9, 20));
    markSlouch(day, at(9, 50)); // 같은 세션의 두 번째는 무시
    startSession(day, at(13));
    markSlouch(day, at(13, 30));
    startSession(day, at(16)); // 무너지지 않은 세션은 평균에서 제외

    const s = summarize(day);
    expect(s.sessions).toBe(3);
    expect(s.avgFirstSlouchMinutes).toBe(25);
  });

  it('기록이 없으면 비율과 평균은 null', () => {
    const s = summarize(emptyDay());
    expect(s.goodRatio).toBeNull();
    expect(s.avgFirstSlouchMinutes).toBeNull();
  });

  it('저장소에 저장하고 다시 읽는다, 깨진 값이면 빈 기록', () => {
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    const day = emptyDay();
    startSession(day, at(9));
    saveDay('2026-10-30', day, storage);
    expect(loadDay('2026-10-30', storage)).toEqual(day);

    mem.set('barunmok:bad', '{not json');
    expect(loadDay('bad', storage)).toEqual(emptyDay());
  });

  it('저장소를 쓸 수 없어도 오류를 내지 않는다', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(() => saveDay('x', emptyDay(), broken)).not.toThrow();
    expect(loadDay('x', broken)).toEqual(emptyDay());
  });
});
