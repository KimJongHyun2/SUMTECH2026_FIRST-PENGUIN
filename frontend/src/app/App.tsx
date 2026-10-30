import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { useSession } from "./SessionProvider";
import { Header } from "../components/layout/Header";
import { Modal } from "../components/ui/Modal";
import { Button } from "../components/ui/Button";
import { WARNING_TEXT } from "../lib/policy";
import { HomePage } from "../pages/HomePage";
import { SetupPage } from "../pages/SetupPage";
import { WatchPage } from "../pages/WatchPage";
import { SettingsPage } from "../pages/SettingsPage";
import { ReportPage } from "../pages/ReportPage";
import { HistoryPage } from "../pages/HistoryPage";
import { ConnectPage } from "../pages/ConnectPage";
import { PhonePage } from "../pages/PhonePage";
import { NotFoundPage } from "../pages/NotFoundPage";

export function App() {
  const { pathname } = useLocation(),
    { state, controller } = useSession();
  const dark = ["/watch", "/phone"].includes(pathname);
  useEffect(() => {
    if (controller.phone && pathname !== "/phone") controller.releasePairing();
    if (
      controller.getSnapshot().session?.state === "running" &&
      !["/watch", "/settings"].includes(pathname) &&
      !pathname.startsWith("/report")
    )
      controller.pause();
    window.scrollTo(0, 0);
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [pathname, controller]);
  return (
    <div
      className={`min-h-screen px-5 py-6 md:px-[3.333vw] md:py-11 ${dark ? "bg-night text-white" : "bg-white text-ink"}`}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:bg-primary focus:p-4 focus:text-ink"
      >
        본문 바로가기
      </a>
      <Header home={pathname === "/"} dark={dark} />
      {state.storageError && (
        <div
          role="alert"
          className="mx-auto mt-4 max-w-[1792px] rounded-xl bg-orange-100 p-4 text-sm text-orange-900"
        >
          {state.storageError}
        </div>
      )}
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto max-w-[1792px] outline-none"
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/watch" element={<WatchPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/report/:id?" element={<ReportPage />} />
          <Route path="/connect" element={<ConnectPage />} />
          <Route path="/phone" element={<PhonePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <footer className="mx-auto mt-12 max-w-[1792px] text-center text-xs leading-relaxed text-muted">
        개인 기준 대비 변화를 확인하는 도구이며 의학적 진단이 아닙니다.
      </footer>
      <Modal
        open={state.warning}
        title="자세가 기준에서 벗어났어요!"
        onClose={controller.dismissWarning}
      >
        <div className="mx-auto my-7 grid size-20 place-items-center rounded-full bg-warning text-5xl font-bold text-white">
          !
        </div>
        <p className="text-center leading-relaxed text-muted">{WARNING_TEXT}</p>
        {/* Figma 06 경고 화면의 측면 앉은 자세 일러스트 */}
        <img
          src="/images/warning-posture.png"
          alt="노트북 앞에 앉아 등과 목을 펴는 측면 자세 일러스트"
          className="mx-auto mt-6 w-[360px] max-w-full"
        />
        <div className="mt-8 flex justify-center gap-3">
          <Button onClick={controller.dismissWarning}>확인했어요</Button>
          <Button
            onClick={() => {
              controller.pause();
              controller.dismissWarning();
            }}
          >
            일시 정지
          </Button>
        </div>
      </Modal>
    </div>
  );
}
