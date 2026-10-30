// '[테스트용] 측면 데이터 주입' (docs/prd.md 7절): 실제 중계 서버에 휴대폰 역할로 접속해 QR 토큰으로 연결을 요청하고,
// PC 승인 뒤 정면 녹화와 같은 시각의 측면 특징을 보낸다. PC 승인·양쪽 등록은 화면에서 직접 한다.
// 측면 각도는 모의 값이며 실제 휴대폰 촬영·연결 종료 검증을 대신하지 않는다.
import {
  PairingService,
  type RelayMessage,
} from "../connection/PairingService";
import type { Clip } from "./evalMode";

// 모의 측면 각도(도). 판정(deep.js)은 기준 대비 15°×민감도 배율 이상 작아지면 이탈로 본다.
const ANGLES: Record<Exclude<Clip, "away">, number> = { good: 80, turtle: 60 };
const SEND_EVERY_MS = 250;

export class SimulatedPhone {
  private pairing = new PairingService((message) => this.receive(message));
  private timer?: ReturnType<typeof setInterval>;
  private seq = 0;
  private clip: Clip = "good";
  approved = false;
  constructor(private status: (text: string) => void) {}
  connect(token: string) {
    this.pairing.connect("phone", () =>
      this.pairing.send({ type: "connect.request", token }),
    );
    this.status(
      "모의 휴대폰이 연결을 요청했어요. PC에서 '연결 승인'을 눌러 주세요.",
    );
  }
  show(clip: Clip) {
    this.clip = clip;
  }
  private receive(message: RelayMessage) {
    if (message.type === "link.approved") {
      this.approved = true;
      clearInterval(this.timer);
      this.timer = setInterval(() => this.sendSide(), SEND_EVERY_MS);
      this.status("모의 측면 입력을 보내고 있어요.");
    }
    if (message.type === "stop.request") {
      clearInterval(this.timer);
      this.pairing.send({ type: "stop.done", stopId: message.stopId });
    }
    if (message.type === "connect.rejected")
      this.status(`모의 휴대폰 연결 거부: ${String(message.message ?? "")}`);
    if (["link.closed", "link.revoked"].includes(message.type)) this.close();
  }
  private sendSide() {
    const valid = this.clip !== "away";
    this.pairing.send({
      type: "side",
      seq: ++this.seq,
      t: this.pairing.toServer(Date.now()),
      valid,
      angleDeg: valid ? ANGLES[this.clip as Exclude<Clip, "away">] : null,
      earVis: valid ? 0.9 : 0,
      shoulderVis: valid ? 0.9 : 0,
    });
  }
  /** '[테스트용] 측면 연결 끊기': 측면 입력을 멈추고 연결을 끊는다. 종료 요청에도 응답하지 않는다. */
  close() {
    clearInterval(this.timer);
    this.approved = false;
    this.pairing.close();
  }
}
