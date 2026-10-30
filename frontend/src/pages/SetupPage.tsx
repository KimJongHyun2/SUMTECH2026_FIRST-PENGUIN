import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../app/SessionProvider";
import { PageHeading } from "../components/layout/PageHeading";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { CameraPreview } from "../features/camera/CameraPreview";
import { SidePreview } from "../features/camera/SidePreview";
import { TestTools } from "../features/eval/TestTools";
export function SetupPage() {
  const { state, controller } = useSession(),
    navigate = useNavigate();
  useEffect(
    () => () => {
      if (controller.getSnapshot().session?.state !== "running")
        controller.leaveSetup();
    },
    [controller],
  );
  if (state.cameraStatus !== "on")
    return (
      <section className="flex flex-col items-center gap-10 pt-14">
        <PageHeading
          title="카메라를 연결해주세요"
          description={
            "자세 확인을 위해 웹캠 접근 권한이 필요합니다.\n버튼을 누르면 카메라가 켜집니다."
          }
          centered
        />
        <div className="flex h-[300px] w-full max-w-[860px] flex-col items-center justify-center gap-6 rounded-[20px] border border-line bg-surface md:h-[420px]">
          <span className="grid size-[110px] place-items-center rounded-full bg-white">
            <Icon name="2008-123-imgIcon" />
          </span>
          <p className="text-muted">
            {state.cameraStatus === "loading"
              ? "카메라와 모델을 준비하고 있어요…"
              : "카메라 연결 대기"}
          </p>
        </div>
        <Button
          variant="primary"
          size="large"
          className="w-full max-w-[500px]"
          disabled={state.cameraStatus === "loading"}
          onClick={controller.openCamera}
        >
          {state.cameraStatus === "loading" ? "준비 중…" : "카메라 켜기"}
        </Button>
        {state.error && (
          <p role="alert" className="text-red-700">
            {state.error}
          </p>
        )}
        <TestTools />
      </section>
    );
  const deep = state.mode === "deep";
  const hint = state.collecting
    ? state.notice
    : !state.confirmed
      ? "먼저 ‘카메라 배치와 앉은 자세를 확인했어요’를 체크해 주세요."
      : state.mode === "deep" && !controller.remoteValid
        ? "휴대폰 측면 카메라의 유효한 입력을 기다리고 있어요."
        : state.frame?.quality !== "valid"
          ? "얼굴과 양쪽 어깨가 보이도록 카메라 배치를 조정해 주세요."
          : controller.canBegin
            ? deep
              ? "정면·측면 양쪽 기준이 등록됐어요. 딥 모드 탐지 시작 버튼을 눌러 주세요."
              : "기준 자세가 등록됐어요. 탐지 시작 버튼을 눌러 주세요."
            : deep
              ? "준비됐어요. 기준 자세 등록 버튼을 누르고 정면·측면 모두 5초 동안 자세를 유지해 주세요."
              : "준비됐어요. 기준 자세 등록 버튼을 누르고 5초 동안 자세를 유지해 주세요.";
  return (
    <section className="space-y-10 pt-14">
      <PageHeading
        title="기준 자세를 등록해주세요"
        description={
          deep
            ? "정면·측면 양쪽 기준을 함께 등록해요.\n두 카메라 모두 안정된 입력을 같은 5초 동안 유지하면 기준이 설정됩니다."
            : "카메라에 얼굴과 어깨가 보이도록 앉아 주세요.\n안정된 입력을 연속 5초 유지하면 개인 기준이 설정됩니다."
        }
      />
      <div className="flex flex-col items-start gap-8 lg:flex-row lg:gap-14">
        {deep ? (
          // 딥 모드: 정면과 휴대폰 측면 영상을 나란히 보며 양쪽 기준을 함께 등록한다.
          <div className="grid w-full max-w-[1100px] gap-4 md:grid-cols-2">
            <figure className="grid gap-2">
              <figcaption className="text-sm font-bold">
                정면 · PC 카메라
              </figcaption>
              <CameraPreview guide />
            </figure>
            <figure className="grid gap-2">
              <figcaption className="text-sm font-bold">
                측면 · 휴대폰 카메라
              </figcaption>
              <SidePreview />
            </figure>
          </div>
        ) : (
          <div className="w-full max-w-[630px]">
            <CameraPreview guide />
          </div>
        )}
        <div className="grid gap-7 text-sm md:text-base">
          {[
            ["얼굴과 귀가 보여요", (state.frame?.signals?.ear_vis ?? 0) >= 0.5],
            [
              "양쪽 어깨가 보여요",
              (state.frame?.signals?.shoulder_vis ?? 0) >= 0.5,
            ],
          ].map(([label, valid]) => (
            <div key={String(label)} className="flex items-center gap-3">
              <Icon
                name="2008-140-imgIconCheck"
                className={valid ? "" : "opacity-20"}
              />
              <span>{label}</span>
            </div>
          ))}
          <label className="flex max-w-[360px] items-start gap-3 rounded-xl bg-primary-tint p-4">
            <input
              type="checkbox"
              checked={state.confirmed}
              onChange={(e) => controller.confirmPlacement(e.target.checked)}
              className="mt-1 size-5 shrink-0 accent-primary-strong"
            />
            카메라 배치와 앉은 자세를 확인했어요
          </label>
          {state.mode === "deep" &&
            (state.connection === "approved" ? (
              <p>
                {controller.remoteValid
                  ? "측면 입력이 유효해요"
                  : "측면 입력 대기"}
              </p>
            ) : (
              // 일시 정지·종료 요청이나 연결 유실로 휴대폰 연결이 끝나면 새 QR로 다시 연결한다.
              <div className="grid gap-3">
                <p>휴대폰 연결이 끝났어요.</p>
                <Button
                  onClick={() => {
                    controller.reconnect();
                    navigate("/connect");
                  }}
                >
                  휴대폰 다시 연결
                </Button>
              </div>
            ))}
        </div>
      </div>
      <div className="grid max-w-[840px] gap-4">
        <progress
          aria-label="기준 등록 진행률"
          value={state.progress}
          max={1}
          className="h-2 w-full accent-primary-strong"
        />
        <p role="status" className="min-h-12 text-sm leading-relaxed">
          {hint}
        </p>
        <Button
          variant="primary"
          size="large"
          disabled={!controller.canRegister}
          onClick={controller.register}
        >
          {state.collecting
            ? `기준 확인 중 · ${Math.floor(state.progress * 100)}%`
            : "기준 자세 등록"}
        </Button>
        <Button
          variant="primary"
          size="large"
          disabled={!controller.canBegin}
          onClick={() => {
            if (controller.begin()) navigate("/watch");
          }}
        >
          {state.session
            ? "탐지 재개"
            : state.mode === "deep"
              ? "딥 모드 탐지 시작"
              : "탐지 시작"}
        </Button>
      </div>
      <TestTools />
    </section>
  );
}
