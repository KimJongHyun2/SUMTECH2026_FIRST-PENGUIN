import { useState } from "react";
import { useSession } from "../../app/SessionProvider";
import { Button } from "../../components/ui/Button";
// 평가 전용 빌드의 '테스트 도구' (docs/prd.md 7절). 등록·감지·딥 연결 화면 아래에 같은 도구를 둔다.
// 버튼은 녹화 입력·측면 모의 입력·리포트 주기만 바꾸고, 경고·복귀·리포트는 공통 엔진이 만든다.
export function TestTools() {
  const { state, controller } = useSession();
  const [open, setOpen] = useState(false);
  if (!controller.eval) return null;
  return (
    <section className="rounded-2xl border border-dashed border-warning p-5 text-sm">
      <Button
        aria-expanded={open}
        aria-controls="test-tools-body"
        onClick={() => setOpen(!open)}
      >
        테스트 도구
      </Button>
      {open && (
        <div id="test-tools-body" className="mt-4 grid gap-4">
          <p className="text-muted">
            평가 전용 빌드의 시험 입력이에요. 실제 카메라·휴대폰 검증을 대신하지
            않아요.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={controller.testAccelerate}>
              [테스트용] 리포트 3초 가속
            </Button>
            <Button onClick={() => controller.testReplay("front")}>
              [테스트용] 정면 이탈·복귀 재생
            </Button>
            <Button onClick={() => controller.testReplay("away")}>
              [테스트용] 자리 비움·재이탈 재생
            </Button>
            <Button onClick={controller.testInjectSide}>
              [테스트용] 측면 데이터 주입
            </Button>
            <Button onClick={() => controller.testReplay("both")}>
              [테스트용] 양쪽 이탈·복귀 재생
            </Button>
            <Button onClick={controller.testCutSide}>
              [테스트용] 측면 연결 끊기
            </Button>
          </div>
          <p role="status" aria-live="polite">
            {state.testStatus}
          </p>
        </div>
      )}
    </section>
  );
}
