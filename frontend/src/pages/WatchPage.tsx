import { useNavigate } from "react-router-dom";
import { useSession } from "../app/SessionProvider";
import { CameraPreview } from "../features/camera/CameraPreview";
import { SidePreview } from "../features/camera/SidePreview";
import { Icon } from "../components/ui/Icon";
import { StatCard } from "../components/ui/StatCard";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { TestTools } from "../features/eval/TestTools";
import { metricsFor, RECOGNITION_LABELS } from "../lib/posture";
import { duration, percentage } from "../lib/format";
export function WatchPage() {
  const { state, controller } = useSession(),
    navigate = useNavigate(),
    session = state.session;
  if (!session)
    return (
      <EmptyState>
        <h1 className="mb-6 text-2xl font-bold">시작할 세션이 없어요</h1>
        <Button
          variant="primary"
          onClick={() => {
            controller.newSession("basic");
            navigate("/setup");
          }}
        >
          자세 등록하고 시작
        </Button>
      </EmptyState>
    );
  const running = session.state === "running",
    valid = state.frame?.quality === "valid",
    m = metricsFor(session);
  const openEvent = session.events.some((event) => event.endValid === null);
  const title = !running
    ? session.state === "recovering"
      ? "연결이 끊겨 판정을 멈췄어요"
      : "판정이 멈춰 있어요"
    : !valid
      ? RECOGNITION_LABELS[
          state.frame?.quality === "away" ||
          state.frame?.quality === "side_stale" ||
          state.frame?.quality === "side_unrecognized"
            ? state.frame.quality
            : "unrecognized"
        ]
      : openEvent
        ? "기준 자세를 확인해 주세요"
        : "기준 범위 안에 있어요";
  const badge = (
    <span className="shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-bold text-ink">
      {running
        ? "● 실시간 확인 중"
        : session.state === "recovering"
          ? "복구 대기"
          : session.state === "ended"
            ? "세션 종료"
            : "일시 정지"}
    </span>
  );
  const detail =
    valid && running
      ? "등록한 개인 기준과 비교하고 있어요."
      : "입력이 유효할 때만 감지 시간을 기록해요.";
  const cameraText = state.stream ? "카메라 켜짐" : "카메라 꺼짐";
  return (
    <section className="space-y-6 pt-7">
      <div
        className={`grid overflow-hidden rounded-[22px] bg-night-card ${state.mode === "deep" ? "lg:grid-cols-2" : "lg:grid-cols-[780fr_1012fr]"}`}
      >
        <div className="flex items-center bg-[#2e3538]">
          <CameraPreview />
        </div>
        {state.mode === "deep" ? (
          // 딥 모드: 상태는 작은 띠로 줄이고 휴대폰 측면 영상을 함께 보여 준다.
          <div className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-center gap-3">
              {badge}
              <h1 className="text-lg font-bold text-primary">{title}</h1>
              <p className="text-xs text-gray-400">
                {detail} · {cameraText}
              </p>
            </div>
            <SidePreview />
          </div>
        ) : (
          <div className="flex min-h-[320px] flex-col items-center gap-7 p-7 text-center">
            {badge}
            <Icon name="2008-170-imgIconPosture" className="mt-3" />
            <h1 className="text-2xl font-bold text-primary md:text-3xl">
              {title}
            </h1>
            <p className="text-sm text-gray-400">{detail}</p>
            <p className="text-xs text-gray-400">{cameraText}</p>
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 md:gap-6">
        <StatCard
          dark
          label="유효 감지 시간"
          value={duration(session.validMs)}
        />
        <StatCard
          dark
          label="확정 이탈 횟수"
          value={`${session.events.length}회`}
        />
        <StatCard dark label="이탈 비율" value={percentage(m.ratio)} />
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={session.state === "ended"}
          onClick={() => {
            if (running) controller.pause();
            else {
              controller.prepareResume();
              navigate("/setup");
            }
          }}
        >
          {running ? "일시 정지" : "재개"}
        </Button>
        <Button
          onClick={() => {
            const id = controller.end();
            navigate(`/report/${id}`);
          }}
        >
          세션 종료
        </Button>
        <Button
          onClick={() => {
            controller.rebaseline();
            navigate("/setup");
          }}
        >
          기준 다시 등록
        </Button>
        <Button onClick={() => navigate("/settings")}>설정</Button>
        <Button
          onClick={() => {
            controller.save();
            navigate(`/report/${session.id}`);
          }}
        >
          리포트 보기
        </Button>
        {state.mode === "deep" && (
          <>
            <Button
              onClick={() => {
                controller.reconnect();
                navigate("/connect");
              }}
            >
              휴대폰 다시 연결
            </Button>
            <Button
              disabled={!controller.canFallback}
              onClick={controller.fallback}
            >
              기본 모드로 계속
            </Button>
          </>
        )}
      </div>
      <p role="status" className="text-sm text-gray-400">
        {state.notice}
      </p>
      <TestTools />
    </section>
  );
}
