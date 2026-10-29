// 평가 전용 빌드의 측면 모의 입력 (docs/prd.md 7절, e2e/fixtures/README.md).
// 실제 휴대폰 대신 같은 PC 페이지에서 휴대폰 역할로 연결 서버에 붙어 연결 요청·측면 특징·종료 응답을 보낸다.
// 승인·양쪽 기준 등록·기본 모드 전환은 사용자가 UI로 한다. 실제 QR·휴대폰 카메라 시험을 대신하지 않는다.
import { PhoneLink } from './deep-link.js';

const SEND_MS = 250;
const UPRIGHT_DEG = 80; // 바른 자세의 측면 각도(모의값)
const LEAN_DEG = 55;    // 이탈 재생 때의 각도. 기준 대비 25° 줄어 측면 경계(15°)를 넘는다
const CUT_CLOSE_MS = 3000; // 입력을 멈춘 뒤(2초 뒤 입력 갱신 중단 알림) 연결을 끊기까지

export class MockPhone {
  constructor() {
    this.link = new PhoneLink();
    this.angle = UPRIGHT_DEG;
    this.token = null;
    this.timer = null;
    this.cut = false;
    this.link.on((type, detail) => this.#onEvent(type, detail));
  }

  get status() { return this.link.status; }

  connect(token) {
    this.token = token;
    this.link.open();
  }

  /** 양쪽 이탈·복귀 재생: 정면 녹화 구간과 함께 측면 각도를 바꾼다. */
  lean(on) {
    this.angle = on ? LEAN_DEG : UPRIGHT_DEG;
  }

  /** 측면 입력 중단 → 연결 끊김. 종료 요청에는 응답하지 않는다. */
  cutConnection() {
    this.cut = true;
    this.#stopSending();
    setTimeout(() => this.link.close(), CUT_CLOSE_MS);
  }

  close() {
    this.#stopSending();
    this.link.close();
  }

  #onEvent(type, detail) {
    if (type === 'change' && this.token && this.link.status === 'ready') {
      this.link.requestConnect(this.token);
      this.token = null;
    }
    if (type === 'change' && this.link.status === 'linked' && !this.timer && !this.cut) {
      this.timer = setInterval(() => this.#send(), SEND_MS);
    }
    if (type === 'stop') {
      this.#stopSending();
      if (!this.cut) this.link.confirmStop(detail);
    }
    if (type === 'end') this.#stopSending();
  }

  #send() {
    this.link.sendSide({ valid: true, angleDeg: this.angle, earVis: 0.95, shoulderVis: 0.95 });
  }

  #stopSending() {
    clearInterval(this.timer);
    this.timer = null;
  }
}
