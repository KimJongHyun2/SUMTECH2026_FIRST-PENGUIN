import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../../app/SessionProvider";
import { Button } from "../../components/ui/Button";
/** 딥 모드 PC 화면의 휴대폰 측면 영상. 화면에만 보여 주고 저장하지 않는다. */
export function SidePreview() {
  const { state, controller } = useSession();
  const navigate = useNavigate();
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = state.sideStream;
      if (state.sideStream) void ref.current.play().catch(() => {});
    }
  }, [state.sideStream]);
  const failed = state.sideVideoStatus === "failed";
  const label = failed
    ? "측면 영상 연결에 실패했어요"
    : !state.sideStream
      ? "측면 영상을 기다리고 있어요"
      : state.remote?.quality === "valid"
        ? "측면 입력이 유효해요"
        : "측면 입력을 확인해 주세요";
  return (
    <div className="relative aspect-[630/430] w-full overflow-hidden rounded-[20px] bg-[#2e3538]">
      <video
        ref={ref}
        muted
        playsInline
        autoPlay
        aria-label="휴대폰 측면 영상"
        className="h-full w-full object-contain"
      />
      {failed && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 p-5 text-center text-white"
          role="alert"
        >
          <p>측면 영상을 불러오지 못했어요.</p>
          <p className="text-sm">
            PC와 휴대폰의 네트워크를 확인한 뒤 새 QR로 다시 연결해 주세요. 자세
            판정은 측면 각도 입력 상태를 따릅니다.
          </p>
          <Button
            onClick={() => {
              controller.reconnect();
              navigate("/connect");
            }}
          >
            휴대폰 다시 연결
          </Button>
        </div>
      )}
      <span
        role="status"
        className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-3 py-1 text-xs text-white"
      >
        {label}
      </span>
    </div>
  );
}
