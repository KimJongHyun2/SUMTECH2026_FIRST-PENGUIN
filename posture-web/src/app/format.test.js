import { describe, expect, it } from 'vitest';
import { APP_TITLE, warningTitle } from './format.js';

describe('탭 제목 경고 (다른 탭·IDE를 보는 동안의 전달)', () => {
  it('경고가 없으면 기본 제목이다', () => {
    expect(warningTitle({ warning: false, hidden: true, now: 1000 })).toBe(APP_TITLE);
  });

  it('보고 있는 화면에서는 경고 제목을 고정해 보여 준다', () => {
    expect(warningTitle({ warning: true, hidden: false, now: 0 })).toBe('⚠ 자세 확인 · 패스트거북이');
    expect(warningTitle({ warning: true, hidden: false, now: 1000 })).toBe('⚠ 자세 확인 · 패스트거북이');
  });

  it('탭이 가려져 있으면 1초마다 제목을 번갈아 바꿔 탭 줄에서 눈에 띄게 한다', () => {
    const a = warningTitle({ warning: true, hidden: true, now: 0 });
    const b = warningTitle({ warning: true, hidden: true, now: 1000 });
    expect(a).not.toBe(b);
    expect([a, b].every((title) => title.includes('자세'))).toBe(true);
  });
});
