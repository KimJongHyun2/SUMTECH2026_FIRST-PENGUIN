import { useEffect, useRef } from "react";
import { useSession } from "../../app/SessionProvider";
/** 딥 모드 PC 화면의 휴대폰 측면 영상. 화면에만 보여 주고 저장하지 않는다. */
export function SidePreview() {
  const { state } = useSession();
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = state.sideStream;
      if (state.sideStream) void ref.current.play().catch(() => {});
    }
  }, [state.sideStream]);
  const label = !state.sideStream
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
      <span className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-3 py-1 text-xs text-white">
        {label}
      </span>
    </div>
  );
}
