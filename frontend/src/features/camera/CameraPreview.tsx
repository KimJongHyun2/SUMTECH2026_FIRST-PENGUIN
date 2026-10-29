import { useEffect, useRef } from "react";
import { useSession } from "../../app/SessionProvider";
export function CameraPreview({ guide = false }: { guide?: boolean }) {
  const { state } = useSession();
  const ref = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = state.stream;
      if (state.stream) void ref.current.play().catch(() => {});
    }
  }, [state.stream]);
  useEffect(() => {
    if (!guide || !viewport.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (overlay.current)
        overlay.current.style.transform = `scale(${entry.contentRect.width / 630})`;
    });
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [guide]);
  const label =
    state.cameraStatus !== "on"
      ? "카메라가 꺼져 있어요"
      : state.frame?.quality === "valid"
        ? "입력이 유효해요"
        : state.frame?.quality === "away"
          ? "자리를 비웠어요"
          : "입력을 확인해 주세요";
  return (
    <div
      ref={viewport}
      className="relative aspect-[630/430] w-full overflow-hidden rounded-[20px] bg-[#2e3538]"
    >
      <video
        ref={ref}
        muted
        playsInline
        autoPlay
        aria-label="카메라 미리보기"
        className={`h-full w-full object-contain ${location.pathname === "/phone" ? "" : "-scale-x-100"}`}
      />
      {guide && (
        <div
          ref={overlay}
          className="pointer-events-none absolute top-0 left-0 origin-top-left"
        >
          <img
            src="/design/2008-140-imgFaceGuideOverlay.svg"
            alt="얼굴 위치 안내선"
            className="max-w-none"
          />
        </div>
      )}
      <span className="absolute bottom-3 left-3 rounded-lg bg-black/70 px-3 py-1 text-xs text-white">
        {label}
      </span>
    </div>
  );
}
