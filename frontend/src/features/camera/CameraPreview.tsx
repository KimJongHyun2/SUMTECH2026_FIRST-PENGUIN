import { useEffect, useRef, useState } from "react";
import { useSession } from "../../app/SessionProvider";
import { Button } from "../../components/ui/Button";
export function CameraPreview({ guide = false }: { guide?: boolean }) {
  const { state } = useSession();
  const ref = useRef<HTMLVideoElement>(null);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    let current = true;
    video.srcObject = state.stream;
    setPlaybackFailed(false);
    if (state.stream)
      void video.play().catch(() => {
        if (current) setPlaybackFailed(true);
      });
    return () => {
      current = false;
      video.srcObject = null;
    };
  }, [state.stream]);
  const retryPlayback = async () => {
    const video = ref.current,
      stream = state.stream;
    if (!video || !stream) return;
    try {
      await video.play();
      if (video.srcObject === stream) setPlaybackFailed(false);
    } catch {
      if (video.srcObject === stream) setPlaybackFailed(true);
    }
  };
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
      : playbackFailed
        ? "카메라 미리보기 재생 실패"
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
      {state.cameraStatus === "on" && playbackFailed && (
        <div
          role="alert"
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/80 p-5 text-center text-white"
        >
          <p>카메라 미리보기를 재생하지 못했어요.</p>
          <p className="text-sm">
            미리보기 다시 재생을 눌러 주세요. 카메라 연결과 자세 입력은
            유지돼요.
          </p>
          <Button onClick={() => void retryPlayback()}>
            미리보기 다시 재생
          </Button>
        </div>
      )}
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
