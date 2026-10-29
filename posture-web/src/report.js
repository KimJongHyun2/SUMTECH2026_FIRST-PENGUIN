// 하루 단위 자세 기록. 브라우저 localStorage에만 저장한다 (서버로 보내지 않음).
const STATES = ['good', 'warn', 'bad', 'bow'];
const pad = (n) => String(n).padStart(2, '0');

export function dayKey(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const emptyDay = () => ({ hours: {}, sessions: [] });

export function addTime(day, t, cls, ms) {
  if (!STATES.includes(cls)) return;
  const slot = (day.hours[new Date(t).getHours()] ??= { good: 0, warn: 0, bad: 0, bow: 0 });
  slot[cls] += ms;
}

/** 자리에 앉아 측정을 시작한 시점 */
export function startSession(day, t) {
  day.sessions.push({ start: t, firstSlouch: null });
}

/** 이번 세션에서 처음 거북목이 시작된 시점(알림의 since). 앉은 뒤 몇 분 만에 무너졌는지 계산에 쓴다. */
export function markSlouch(day, since) {
  const s = day.sessions.at(-1);
  if (s && s.firstSlouch === null) s.firstSlouch = Math.max(0, since - s.start);
}

export function summarize(day) {
  const total = { good: 0, warn: 0, bad: 0, bow: 0 };
  const hourly = Object.entries(day.hours)
    .map(([hour, slot]) => {
      const sum = STATES.reduce((a, k) => a + slot[k], 0);
      STATES.forEach((k) => { total[k] += slot[k]; });
      return { hour: Number(hour), minutes: sum / 60_000, goodRatio: sum ? slot.good / sum : null };
    })
    .sort((a, b) => a.hour - b.hour);

  const all = STATES.reduce((a, k) => a + total[k], 0);
  const firsts = day.sessions.map((s) => s.firstSlouch).filter((v) => v !== null);
  return {
    minutes: all / 60_000,
    goodRatio: all ? total.good / all : null,
    turtleMinutes: (total.warn + total.bad) / 60_000,
    bowMinutes: total.bow / 60_000,
    sessions: day.sessions.length,
    avgFirstSlouchMinutes: firsts.length ? firsts.reduce((a, b) => a + b, 0) / firsts.length / 60_000 : null,
    hourly,
  };
}

export function loadDay(key, storage = globalThis.localStorage) {
  try {
    return JSON.parse(storage.getItem(`barunmok:${key}`)) ?? emptyDay();
  } catch {
    return emptyDay();
  }
}

export function saveDay(key, day, storage = globalThis.localStorage) {
  try {
    storage.setItem(`barunmok:${key}`, JSON.stringify(day));
  } catch {
    // 시크릿 모드 등 저장소를 못 쓰면 이번 화면에서만 보여준다.
  }
}
