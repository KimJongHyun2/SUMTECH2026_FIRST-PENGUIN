import type { SessionRecord } from "../../lib/types";
export function SessionTimeline({ session }: { session: SessionRecord }) {
  const segments: { duration: number; deviated: boolean }[] = [];
  let cursor = 0;
  for (const event of session.events) {
    if (event.onsetValid > cursor)
      segments.push({ duration: event.onsetValid - cursor, deviated: false });
    const end = event.endValid ?? session.validMs;
    segments.push({ duration: end - event.onsetValid, deviated: true });
    cursor = end;
  }
  if (session.validMs > cursor)
    segments.push({ duration: session.validMs - cursor, deviated: false });
  return (
    <div
      className="my-10 flex h-16 overflow-hidden rounded-lg bg-primary-tint"
      role="img"
      aria-label="유효 시간 순서의 기준 범위와 확정 이탈 구간"
    >
      {segments.map((segment, i) => (
        <span
          key={i}
          className={segment.deviated ? "bg-warning" : "bg-primary-strong"}
          style={{ width: `${(segment.duration / session.validMs) * 100}%` }}
        />
      ))}
    </div>
  );
}
