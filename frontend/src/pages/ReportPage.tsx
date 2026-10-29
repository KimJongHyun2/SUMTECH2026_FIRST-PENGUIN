import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSession } from "../app/SessionProvider";
import { PageHeading } from "../components/layout/PageHeading";
import { StatCard } from "../components/ui/StatCard";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { SessionTimeline } from "../features/history/SessionTimeline";
import { compareRecords } from "../features/history/storage";
import { duration, dateTime, percentage } from "../lib/format";
import { metricsFor } from "../lib/posture";
export function ReportPage() {
  const { state, controller } = useSession(),
    { id } = useParams(),
    navigate = useNavigate();
  const [comparison, setComparison] = useState("");
  const session =
    id === state.session?.id
      ? state.session
      : id
        ? state.data.sessions.find((s) => s.id === id)
        : (state.session ?? state.data.sessions.at(-1));
  if (!session)
    return (
      <section className="pt-12">
        <PageHeading title="세션 리포트" />
        <EmptyState>분석 가능한 기록이 없습니다</EmptyState>
        <Button onClick={() => navigate("/history")}>내 기록</Button>
      </section>
    );
  const metrics = metricsFor(session);
  const current = session.id === state.session?.id;
  const saved = current
    ? {
        idle: "저장 전",
        saving: "저장 중",
        saved: "저장 완료",
        failed: "저장 실패",
      }[state.saveStatus]
    : "저장된 기록";
  const phoneStop =
    current && session.segments.some((s) => s.mode === "deep")
      ? {
          none: "",
          requested: " · 휴대폰 카메라 종료 요청 중",
          confirmed: " · 휴대폰 카메라 종료 확인",
          unconfirmed: " · 휴대폰 카메라 종료 요청 · 확인 안 됨",
        }[state.phoneStop]
      : "";
  return (
    <section className="space-y-7 pt-12">
      <PageHeading
        title="세션 리포트"
        description={`${dateTime(session.startedAt)} · ${session.state === "ended" ? "세션 종료" : "세션 진행 중"}`}
      />
      <p className="text-sm text-muted">
        {state.stream ? "카메라 켜짐" : "카메라 꺼짐"} · {saved}
        {phoneStop}
      </p>
      {session.validMs ? (
        <>
          <div className="grid grid-cols-3 gap-2 md:gap-6">
            <StatCard
              label="유효 감지 시간"
              value={duration(session.validMs)}
            />
            <StatCard
              label="확정 이탈 시간"
              value={duration(metrics.deviationSeconds * 1000)}
            />
            <StatCard label="이탈 비율" value={percentage(metrics.ratio)} />
          </div>
          <section className="rounded-[20px] border border-line p-6 md:p-10">
            <h2 className="text-xl font-bold">자세 변화 기록</h2>
            <SessionTimeline session={session} />
            <p className="text-sm text-muted">
              초록: 확정 이탈 외 구간 · 주황: 확정 이탈 · 인식 중단 시간 제외
            </p>
            <p className="mt-3 text-sm text-muted">
              확정 이탈 {metrics.newEvents}회 · 정상 복귀{" "}
              {metrics.normalReturns}회 · 중단 {metrics.interruptions}회
            </p>
          </section>
        </>
      ) : (
        <EmptyState>분석 가능한 기록이 없습니다</EmptyState>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          onClick={() =>
            navigate(
              state.session && state.session.state !== "ended"
                ? "/watch"
                : "/history",
            )
          }
        >
          닫기
        </Button>
        <Button onClick={() => navigate("/history")}>내 기록</Button>
        <Button
          onClick={() =>
            setComparison(
              compareRecords(
                session,
                state.data.sessions
                  .filter(
                    (s) =>
                      s.startedAt < session.startedAt && s.state === "ended",
                  )
                  .at(-1),
              ),
            )
          }
        >
          이전 기록과 비교
        </Button>
        <Button onClick={() => void controller.save()}>다시 저장</Button>
      </div>
      <p role="status">{comparison}</p>
      <h2 className="text-xl font-bold">구간 리포트</h2>
      {session.reports.length ? (
        session.reports.map((report) => (
          <div
            key={report.id}
            className="flex flex-wrap justify-between gap-3 border-b border-line py-5 text-sm"
          >
            <span>
              {report.kind === "auto" ? "자동 리포트" : "종료 리포트"} ·{" "}
              {duration(report.startValid)}–{duration(report.endValid)}
            </span>
            <span>
              이탈 {percentage(report.metrics.ratio)} · 수정 {report.revision}
            </span>
          </div>
        ))
      ) : (
        <p className="text-muted">
          유효 감지 30분마다 생성돼요. 종료하면 남은 구간을 정리해요.
        </p>
      )}
    </section>
  );
}
