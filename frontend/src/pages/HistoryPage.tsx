import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../app/SessionProvider";
import { PageHeading } from "../components/layout/PageHeading";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { EmptyState } from "../components/ui/EmptyState";
import { dateTime, duration } from "../lib/format";
export function HistoryPage() {
  const { state, controller } = useSession(),
    navigate = useNavigate();
  const [deleting, setDeleting] = useState<string | null>(null);
  return (
    <section className="space-y-8 pt-12">
      <PageHeading
        title="내 기록"
        description="이 PC의 같은 사이트·브라우저에 저장된 기록이에요."
      />
      {!state.loaded ? (
        <EmptyState>기록을 불러오고 있어요.</EmptyState>
      ) : state.data.sessions.length ? (
        <div>
          {[...state.data.sessions].reverse().map((session) => (
            <article
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-5 border-b border-line px-3 py-6 hover:bg-primary-tint md:px-7"
            >
              <div>
                <h2 className="font-bold">{dateTime(session.startedAt)}</h2>
                <p className="mt-2 text-sm text-muted">
                  {session.mode === "deep" ? "딥 모드" : "기본 모드"} · 유효{" "}
                  {duration(session.validMs)} ·{" "}
                  {session.state === "ended" ? "종료" : "진행 중"}
                </p>
              </div>
              <div className="flex gap-3">
                <Button onClick={() => navigate(`/report/${session.id}`)}>
                  리포트 보기
                </Button>
                {session.state === "ended" && (
                  <Button onClick={() => setDeleting(session.id)}>
                    기록 삭제
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState>저장된 기록이 없어요</EmptyState>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          onClick={() => {
            controller.newSession("basic");
            navigate("/setup");
          }}
        >
          자세 등록하고 시작
        </Button>
        <Button
          disabled={!state.data.sessions.some((s) => s.state === "ended")}
          onClick={() => setDeleting("all")}
        >
          전체 기록 삭제
        </Button>
      </div>
      <Modal
        open={!!deleting}
        title="기록을 삭제할까요?"
        onClose={() => setDeleting(null)}
      >
        <p className="my-6 leading-relaxed text-muted">
          {deleting === "all" ? "종료된 모든 세션의" : "선택한 세션의"} 로그와
          리포트를 삭제해요. 진행 중 세션, 기준 자세와 설정은 유지해요.
        </p>
        <div className="flex justify-center gap-4">
          <Button onClick={() => setDeleting(null)}>취소</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (deleting)
                void controller
                  .deleteRecords(deleting)
                  .then((ok) => ok && setDeleting(null));
            }}
          >
            삭제 확인
          </Button>
        </div>
        {state.storageError && (
          <p role="alert" className="mt-4 text-red-700">
            {state.storageError}
          </p>
        )}
      </Modal>
    </section>
  );
}
