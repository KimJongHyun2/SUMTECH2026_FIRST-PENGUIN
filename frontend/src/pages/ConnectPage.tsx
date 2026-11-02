import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useNavigate } from "react-router-dom";
import { useSession } from "../app/SessionProvider";
import { PageHeading } from "../components/layout/PageHeading";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { CONNECTION_PILOT } from "../lib/policy";
import { TestTools } from "../features/eval/TestTools";
import { SidePreview } from "../features/camera/SidePreview";
const labels = {
  idle: "QR 코드를 생성해 주세요.",
  waiting: "QR을 스캔하고 휴대폰에서 연결 요청을 눌러 주세요.",
  requested: "휴대폰이 연결을 요청했어요. 이 PC에서 승인해 주세요.",
  approved: "연결이 승인됐어요. 휴대폰에서 카메라를 켜 주세요.",
  disconnected: "연결이 끊겼어요. QR을 다시 발급해 주세요.",
  expired: `QR이 만료됐어요(발급 후 ${CONNECTION_PILOT.qrExpirySeconds}초). QR을 다시 발급해 주세요.`,
  used: "이미 사용된 QR이에요. QR을 다시 발급해 주세요.",
  error:
    "연결 서버에 접속할 수 없어요. 서버가 WebSocket을 지원하는지 확인해 주세요.",
};
export function ConnectPage() {
  const { state, controller } = useSession(),
    navigate = useNavigate();
  const [origin, setOrigin] = useState(location.origin),
    [qrOrigin, setQrOrigin] = useState(location.origin),
    [error, setError] = useState(""),
    [placement, setPlacement] = useState(false);
  const qr = useRef<HTMLCanvasElement>(null);
  // 같은 화면에서 재연결해도 배치 안내를 닫고 새 QR을 발급한다.
  useEffect(() => {
    if (state.connection === "idle") {
      setPlacement(false);
      controller.requestPairing("host");
    }
  }, [controller, state.connection]);
  const [now, setNow] = useState(Date.now());
  const waiting = state.connection === "waiting" && !!state.token;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);
  // 요청 전 만료는 PC에서도 바로 보여 준다. 실제 거부는 중계 서버가 요청·승인 때 검사한다.
  const left = Math.max(0, Math.ceil((state.tokenExpiresAt - now) / 1000));
  const connection = waiting && left === 0 ? "expired" : state.connection;
  useEffect(() => {
    if (!state.token || !qr.current || placement) return;
    const url = new URL("/phone", qrOrigin);
    url.hash = state.token;
    void QRCode.toCanvas(qr.current, url.href, { width: 200, margin: 1 }).catch(
      () => setError("QR 생성에 실패했어요."),
    );
  }, [state.token, qrOrigin, placement]);
  if (placement)
    return (
      <section className="flex flex-col items-center gap-10 pt-14">
        <PageHeading
          title="휴대폰을 옆에 배치해 주세요"
          description="귀와 어깨가 가리지 않도록 안정적으로 고정해 주세요."
          centered
        />
        <div className="flex w-full max-w-[950px] flex-col items-center gap-10 md:flex-row">
          {/* 휴대폰 측면 영상을 보며 배치를 맞춘다. */}
          <div className="w-full flex-1">
            <SidePreview />
          </div>
          <ul className="space-y-7">
            {["귀와 어깨가 함께 보이게", "사용 중 위치가 바뀌지 않게"].map(
              (text) => (
                <li key={text} className="flex items-center gap-3">
                  <Icon name="2008-380-imgIconCheck" />
                  {text}
                </li>
              ),
            )}
          </ul>
        </div>
        <Button
          variant="primary"
          size="large"
          className="w-full max-w-[600px]"
          onClick={() => navigate("/setup")}
        >
          확인했어요
        </Button>
      </section>
    );
  return (
    <section className="flex flex-col items-center gap-8 pt-14">
      <PageHeading
        title="딥 모드 연결하기"
        description={
          "QR 코드를 휴대폰으로 스캔한 뒤\n이 PC에서 연결을 승인해 주세요."
        }
        centered
      />
      <div className="grid size-[280px] place-items-center rounded-3xl border border-line">
        {state.token ? (
          <canvas ref={qr} aria-label="휴대폰 연결 QR" />
        ) : (
          <p className="px-8 text-center text-muted">
            아래 버튼으로 QR을 생성해 주세요.
          </p>
        )}
      </div>
      <p role="status" className="max-w-xl text-center">
        {labels[connection]}
        {connection === "waiting" && ` (남은 시간 ${left}초)`}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button
          onClick={() => {
            try {
              const parsed = new URL(origin);
              if (
                parsed.protocol !== "https:" &&
                !(
                  parsed.protocol === "http:" && parsed.hostname === "localhost"
                )
              )
                throw new Error();
              setQrOrigin(parsed.origin);
              setError("");
              controller.requestPairing("host");
            } catch {
              setError("휴대폰에서 접근할 HTTPS 서버 주소를 입력해 주세요.");
            }
          }}
        >
          QR 생성 / 재발급
        </Button>
        {connection === "requested" && (
          <Button variant="primary" onClick={controller.approvePairing}>
            연결 승인
          </Button>
        )}
        <Button
          variant="primary"
          disabled={state.connection !== "approved"}
          onClick={() => setPlacement(true)}
        >
          측면 배치 안내
        </Button>
      </div>
      <label className="grid w-full max-w-[600px] gap-3 rounded-2xl bg-surface p-5 text-sm">
        휴대폰에서 접속 가능한 이 서버 주소
        <input
          value={origin}
          type="url"
          onChange={(e) => setOrigin(e.target.value)}
          className="min-w-0 rounded-xl border border-line bg-white p-3"
        />
        <span className="text-muted">
          localhost는 PC 자신만 가리켜요. 같은 네트워크의 HTTPS 주소 또는 배포
          주소를 사용해 주세요.
        </span>
      </label>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <p className="text-sm text-muted">
        측면 영상은 휴대폰에서 이 PC로 직접 전송해 화면에만 보여 주고 저장하지
        않아요.
      </p>
      <TestTools />
    </section>
  );
}
