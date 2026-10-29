import { useSession } from "../app/SessionProvider";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { CameraPreview } from "../features/camera/CameraPreview";
export function PhonePage() {
  const { state, controller } = useSession();
  const approved = state.connection === "approved";
  return (
    <section className="mx-auto flex max-w-[406px] flex-col items-center gap-8 pt-16 text-center">
      <Icon name="2008-403-imgIconTurtle" />
      <p className="text-[26px] font-bold text-primary">FAST TURTLE</p>
      {approved && (
        <div className="mt-8 grid size-18 place-items-center rounded-full bg-primary">
          <Icon name="2008-403-imgIconCheck" />
        </div>
      )}
      <h1 className="text-2xl font-bold">
        {approved ? "연결이 완료되었어요!" : "PC와 연결해 주세요"}
      </h1>
      <p role="status" className="leading-relaxed text-gray-400">
        {state.connection === "waiting"
          ? "PC의 연결 승인을 기다리고 있어요."
          : state.connection === "expired"
            ? "QR이 만료됐어요. PC에서 QR을 다시 발급해 주세요."
            : state.connection === "used"
              ? "이미 사용됐거나 다시 발급된 QR이에요. PC의 새 QR로 접속해 주세요."
              : ["error", "disconnected"].includes(state.connection)
                ? "연결이 끊겼어요. PC에서 QR을 다시 발급해 주세요."
                : approved
                  ? "카메라를 켜고 귀와 어깨가 보이도록 옆에 배치해 주세요."
                  : "PC에서 생성한 QR 코드로 접속해 주세요."}
      </p>
      <div className="grid w-full gap-4">
        {!approved && (
          <Button
            variant="primary"
            disabled={!location.hash.slice(1)}
            onClick={() =>
              controller.requestPairing("phone", location.hash.slice(1))
            }
          >
            연결 요청
          </Button>
        )}
        <Button
          variant="primary"
          disabled={!approved || state.cameraStatus === "loading"}
          onClick={controller.openCamera}
        >
          {state.cameraStatus === "loading" ? "준비 중…" : "카메라 켜기"}
        </Button>
        <Button onClick={controller.releasePairing}>연결 종료</Button>
      </div>
      {state.cameraStatus === "on" && <CameraPreview />}
      <p role="status" className="text-sm text-gray-400">
        {state.error || state.notice}
      </p>
      <p className="text-xs text-gray-400">
        휴대폰에는 세션 기록을 저장하지 않아요.
      </p>
    </section>
  );
}
