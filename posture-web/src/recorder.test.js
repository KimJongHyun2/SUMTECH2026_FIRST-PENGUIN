import { describe, expect, it } from 'vitest';
import { createRecorder, timestampForFile, toCsv } from './recorder.js';

describe('toCsv', () => {
  it('헤더와 행을 만들고 빈 값은 비워 둔다', () => {
    const csv = toCsv(['a', 'b', 'c'], [{ a: 1, b: null, c: '바른자세' }]);
    expect(csv).toBe('a,b,c\n1,,바른자세\n');
  });

  it('숫자는 소수 넷째 자리까지 반올림한다', () => {
    expect(toCsv(['x'], [{ x: 1.234567 }])).toBe('x\n1.2346\n');
  });

  it('쉼표와 따옴표가 있는 값은 감싼다', () => {
    expect(toCsv(['x'], [{ x: 'a,"b"' }])).toBe('x\n"a,""b"""\n');
  });

  it('NaN은 빈 칸으로 쓴다', () => {
    expect(toCsv(['x'], [{ x: Number.NaN }])).toBe('x\n\n');
  });
});

describe('createRecorder', () => {
  it('기록 중일 때만 행을 쌓는다', () => {
    const r = createRecorder(['x']);
    r.push({ x: 1 });
    r.start();
    r.push({ x: 2 });
    r.stop();
    r.push({ x: 3 });
    expect(r.count).toBe(1);
    r.clear();
    expect(r.count).toBe(0);
  });
});

describe('timestampForFile', () => {
  it('YYYYMMDD_HHMMSS 형식', () => {
    expect(timestampForFile(new Date(2026, 9, 29, 9, 5, 7))).toBe('20261029_090507');
  });
});
