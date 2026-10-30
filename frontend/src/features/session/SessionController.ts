import { CameraService } from "../camera/CameraService";
import {
  PairingService,
  type RelayMessage,
} from "../connection/PairingService";
import { SideVideoLink } from "../connection/SideVideoLink";
import { loadData, freshData, type RecordStore } from "../history/storage";
import {
  EVAL,
  createRecorded,
  createReplay,
  type RecordedSource,
  type ReplayRun,
} from "../eval/evalMode";
import { SimulatedPhone } from "../eval/SimulatedPhone";
import {
  createEngine,
  createCollector,
  createDeepCollector,
  evaluate,
  fuse,
  sideInputQuality,
  type Collector,
  type Engine,
  type EngineSignal,
} from "../../lib/posture";
import {
  CONNECTION_PILOT,
  POLICY,
  sameSettings,
  validateSettings,
  withDefaults,
} from "../../lib/policy";
import type {
  StoredData,
  Mode,
  Frame,
  Settings,
  Signals,
  SessionRecord,
} from "../../lib/types";

const SAVE_FAILED =
  "저장 실패 · 현재 화면의 기록은 남아 있어요. 저장 공간을 확인하고 다시 저장해 주세요.";
const DELETE_FAILED =
  "삭제 내용을 저장하지 못했어요. 기록을 유지했으니 다시 시도해 주세요.";
const LOAD_FAILED =
  "기록을 읽지 못했어요. 기존 데이터를 보호하기 위해 저장을 중단했어요.";
// 시간 값은 백엔드와 같은 파일럿 값이다. 측면 입력이 연결 감시 주기보다 오래되면 판정을 보류하고,
// 연결 유실은 서버의 link.lost로 받되 메시지 자체가 끊기면 장애 판정 시간 뒤 복구 대기로 둔다.
const SIDE_STALE_MS = CONNECTION_PILOT.heartbeatSeconds * 1000;
const SIDE_SYNC_MS = CONNECTION_PILOT.sideMaxAgeSeconds * 1000;
const SIDE_LOST_MS = CONNECTION_PILOT.disconnectSeconds * 1000;
// 평가 전용 '[테스트용] 리포트 3초 가속'의 첫 자동 주기(유효 시간, 초)
const ACCEL_SECONDS = 3;
// 기준 등록을 다시 셀 때의 안내. 사유는 deep.js의 양쪽 기준 수집기가 알려 준다(posture-web 화면과 같은 문구).
const RESTART_TEXT: Record<string, string> = {
  front: "얼굴·어깨가 안정적으로 보일 때부터 5초를 다시 셀게요.",
  side_stale:
    "측면 입력이 끊겨 5초를 다시 셀게요. 휴대폰 연결과 촬영을 확인해 주세요.",
  side_unrecognized:
    "휴대폰이 귀·어깨를 찾지 못해 5초를 다시 셀게요. 옆모습이 보이게 휴대폰을 놓아 주세요.",
  side_unstable:
    "옆모습이 흔들려 5초를 다시 셀게요. 편하게 앉아 움직이지 말아 주세요.",
};

export type Connection =
  | "idle"
  | "waiting"
  | "requested"
  | "approved"
  | "disconnected"
  | "expired"
  | "used"
  | "error";
export interface SessionState {
  data: StoredData;
  session: SessionRecord | null;
  mode: Mode;
  cameraStatus: "off" | "loading" | "on";
  stream: MediaStream | null;
  frame: Frame | null;
  frontValid: boolean;
  confirmed: boolean;
  collecting: boolean;
  progress: number;
  notice: string;
  error: string;
  storageError: string;
  loaded: boolean;
  saveStatus: "idle" | "saving" | "saved" | "failed";
  warning: boolean;
  connection: Connection;
  token: string;
  tokenExpiresAt: number;
  remote: { quality: string; angle: number | null; at: number } | null;
  // 딥 모드 PC: 휴대폰에서 받은 측면 영상(화면 표시용, 저장하지 않음)
  sideStream: MediaStream | null;
  // 휴대폰 측면 카메라 방향(후면 기본, 전면 전환 가능)
  phoneFacing: "environment" | "user";
  phoneStop: "none" | "requested" | "confirmed" | "unconfirmed";
  testStatus: string;
}
export class SessionController {
  readonly camera: CameraService;
  readonly pairing: PairingService;
  private readonly sideVideo: SideVideoLink;
  private listeners = new Set<() => void>();
  private engine: Engine | null = null;
  private collector: Collector = createCollector();
  private store: RecordStore | null = null;
  private writes: Promise<unknown>;
  private pendingWrites = 0;
  private saveBlocked = false;
  private lastSavedAt = 0;
  private lastFrameAt = 0;
  private cameraRequest = 0;
  private phoneStopTimer?: ReturnType<typeof setTimeout>;
  private requestId = "";
  // 평가 전용 빌드의 녹화 입력·재생·모의 휴대폰 (docs/prd.md 7절)
  readonly eval: boolean;
  private recorded: RecordedSource | null;
  private replay: ReplayRun | null = null;
  private simPhone: SimulatedPhone | null = null;
  private sideInjected = false;
  private accelPending = 0;
  private sideSeq = 0;
  private closeAfterPhoneStop = false;
  private audio?: AudioContext;
  private state: SessionState;
  readonly phone: boolean;

  constructor(phone = false) {
    this.phone = phone;
    this.state = {
      data: freshData(),
      session: null,
      mode: "basic",
      cameraStatus: "off",
      stream: null,
      frame: null,
      frontValid: false,
      confirmed: false,
      collecting: false,
      progress: 0,
      notice: "",
      error: "",
      storageError: "",
      loaded: phone,
      saveStatus: "idle",
      warning: false,
      connection: "idle",
      token: "",
      tokenExpiresAt: 0,
      remote: null,
      sideStream: null,
      phoneFacing: "environment",
      phoneStop: "none",
      testStatus: "",
    };
    this.eval = EVAL && !phone;
    this.recorded = this.eval ? createRecorded() : null;
    this.camera = new CameraService(
      (frame) => this.onFrame(frame),
      this.recorded,
    );
    this.pairing = new PairingService((message) => this.onConnection(message));
    this.sideVideo = new SideVideoLink(
      (message) => this.pairing.send(message),
      (sideStream) => this.update({ sideStream }),
    );
    // 휴대폰에는 개인 기록을 저장하지 않는다.
    this.writes = phone ? Promise.resolve() : this.load();
  }
  private async load() {
    try {
      const { store, data } = await loadData();
      this.store = store;
      this.update({ data, loaded: true });
    } catch {
      this.saveBlocked = true;
      this.update({ loaded: true, storageError: LOAD_FAILED });
    }
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  private update(patch: Partial<SessionState> = {}) {
    this.state = {
      ...this.state,
      ...patch,
      session: this.engine?.toJSON() ?? null,
      stream: this.camera?.stream ?? null,
    };
    this.listeners.forEach((listener) => listener());
  }
  private setData(patch: Partial<StoredData>) {
    this.state = { ...this.state, data: { ...this.state.data, ...patch } };
  }
  /** 저장은 순서대로 처리하고, 마지막 저장까지 끝나야 '저장 완료'로 표시한다. */
  private persist(
    task: (store: RecordStore) => Promise<unknown>,
    failure = SAVE_FAILED,
  ) {
    if (this.phone || this.saveBlocked) return Promise.resolve(false);
    this.pendingWrites++;
    this.update({ saveStatus: "saving" });
    const run = this.writes.then(() => task(this.store!));
    this.writes = run.catch(() => undefined);
    return run.then(
      () => {
        this.pendingWrites--;
        if (!this.pendingWrites)
          this.update({ saveStatus: "saved", storageError: "" });
        return true;
      },
      () => {
        this.pendingWrites--;
        this.update({ saveStatus: "failed", storageError: failure });
        return false;
      },
    );
  }
  save = () => {
    if (this.phone || this.saveBlocked) return Promise.resolve(false);
    const engine = this.engine;
    if (engine) {
      const session = engine.toJSON();
      this.setData({
        sessions: [
          ...this.state.data.sessions.filter((s) => s.id !== session.id),
          session,
        ].sort((a, b) => a.startedAt - b.startedAt),
      });
    }
    return this.persist((store) =>
      engine ? store.saveSession(engine, Date.now()) : Promise.resolve(),
    );
  };
  newSession = (mode: Mode) => {
    if (this.engine && this.engine.state !== "ended") {
      this.handle(this.engine.end(Date.now(), "new_session"));
      void this.save();
    }
    this.engine = null;
    this.stopCamera();
    this.closePairing();
    this.replay = null;
    this.simPhone?.close();
    this.simPhone = null;
    this.sideInjected = false;
    this.accelPending = 0;
    this.update({
      mode,
      confirmed: false,
      collecting: false,
      progress: 0,
      warning: false,
      error: "",
      notice: "",
      phoneStop: "none",
      testStatus: "",
    });
  };
  confirmPlacement = (confirmed: boolean) => this.update({ confirmed });
  private stopCamera() {
    this.cameraRequest++;
    if (this.phone) this.sideVideo.close();
    this.camera.stop();
    this.update({
      cameraStatus: "off",
      frame: null,
      frontValid: false,
      collecting: false,
    });
  }
  openCamera = async () => {
    if (
      this.state.cameraStatus === "loading" ||
      (this.phone && this.state.connection !== "approved")
    )
      return;
    const request = ++this.cameraRequest;
    this.update({ cameraStatus: "loading", error: "" });
    try {
      await this.camera.start(
        this.phone,
        this.phone ? this.state.phoneFacing : undefined,
      );
      if (request !== this.cameraRequest) return;
      this.lastFrameAt = 0;
      this.update({
        cameraStatus: "on",
        confirmed: false,
        notice: "카메라 배치와 앉은 자세를 확인해 주세요.",
      });
      // 휴대폰은 측면 영상을 PC 화면에 보여 주도록 보낸다. 실패해도 측면 각도 전송·판정은 계속한다.
      if (this.phone && this.camera.stream)
        void this.sideVideo.offer(this.camera.stream).catch(() => {});
    } catch (error) {
      if (request !== this.cameraRequest) return;
      const e = error as Error;
      if (e.name === "EvalInputError") {
        this.update({ cameraStatus: "off", error: e.message });
        return;
      }
      this.update({
        cameraStatus: "off",
        error: `카메라를 쓸 수 없어요. ${
          e.name === "NotAllowedError"
            ? "카메라 권한을 허용한 뒤 다시 시도해 주세요."
            : e.name === "NotFoundError"
              ? "연결된 카메라가 없어요. 카메라를 연결한 뒤 다시 시도해 주세요."
              : `다시 시도해 주세요. (${e.message})`
        }`,
      });
    }
  };
  /** 휴대폰: 전면·후면 카메라를 바꿔 다시 켠다. 다시 켜면서 PC로 가는 측면 영상도 새 카메라로 바뀐다. */
  switchCamera = () => {
    if (!this.phone || this.state.cameraStatus !== "on") return;
    this.update({
      phoneFacing:
        this.state.phoneFacing === "environment" ? "user" : "environment",
    });
    void this.openCamera();
  };
  get remoteValid() {
    return (
      this.state.connection === "approved" &&
      this.state.remote?.quality === "valid" &&
      Date.now() - this.state.remote.at < SIDE_STALE_MS
    );
  }
  private get remoteLost() {
    return (
      this.state.connection !== "approved" ||
      !this.state.remote ||
      Date.now() - this.state.remote.at > SIDE_LOST_MS
    );
  }
  get canRegister() {
    return (
      this.state.cameraStatus === "on" &&
      this.state.frame?.quality === "valid" &&
      this.state.confirmed &&
      !this.state.collecting &&
      (this.state.mode !== "deep" || this.remoteValid)
    );
  }
  get canBegin() {
    return (
      this.canRegister && this.state.data.baseline?.mode === this.state.mode
    );
  }
  /** 복구 대기 중 정면 기준·입력이 유효할 때만 같은 세션을 기본 모드로 이어 간다. */
  get canFallback() {
    return (
      this.state.mode === "deep" &&
      this.engine?.state === "recovering" &&
      this.state.frontValid &&
      !!this.state.data.baseline
    );
  }
  register = () => {
    if (!this.canRegister) return;
    if (this.engine) this.handle(this.engine.beginRebaseline(Date.now()));
    this.collector = this.newCollector();
    this.setData({ baseline: null });
    this.update({
      collecting: true,
      progress: 0,
      notice:
        this.state.mode === "deep"
          ? "정면·측면 모두 5초 동안 편안하게 자세를 유지해 주세요."
          : "5초 동안 편안하게 자세를 유지해 주세요.",
    });
  };
  /** 딥 모드는 정면·측면이 같은 5초 동안 함께 안정해야 하는 양쪽 기준 수집기를 쓴다. */
  private newCollector() {
    return this.state.mode === "deep"
      ? createDeepCollector()
      : createCollector();
  }
  begin = () => {
    if (!this.canBegin) return false;
    const { data, mode } = this.state;
    if (!this.engine || this.engine.state === "ended")
      this.engine = createEngine({
        id: crypto.randomUUID(),
        startedAt: Date.now(),
        mode,
        baselineId: data.baseline!.id,
        settingsVersionId: data.settingsId,
        settings: { ...data.settings },
      });
    if (this.eval) this.engine.markTest("녹화 입력");
    if (this.sideInjected) this.engine.markTest("측면 데이터 주입");
    if (this.accelPending) {
      this.handle(
        this.engine.accelerateFirstReport(Date.now(), this.accelPending),
      );
      this.accelPending = 0;
    }
    this.handle(this.engine.start(Date.now()));
    void this.save();
    this.update({ notice: "" });
    return true;
  };
  pause = () => {
    if (this.engine) this.handle(this.engine.pause(Date.now()));
    this.stopCamera();
    this.stopPhone(false);
    void this.save();
  };
  prepareResume = () => {
    if (this.engine) this.handle(this.engine.prepare(Date.now()));
    this.stopCamera();
    this.update({ confirmed: false });
  };
  rebaseline = () => {
    if (this.engine) this.handle(this.engine.beginRebaseline(Date.now()));
    this.stopCamera();
    this.setData({ baseline: null });
    this.update({ confirmed: false, progress: 0 });
    void this.save();
  };
  end = () => {
    if (this.engine) this.handle(this.engine.end(Date.now()));
    this.stopCamera();
    this.stopPhone(true);
    void this.save();
    return this.engine?.id;
  };
  leaveSetup = () => {
    this.stopCamera();
    this.update({ progress: 0, confirmed: false });
  };
  dismissWarning = () => this.update({ warning: false });
  applySettings = (settings: Settings) => {
    const error = validateSettings(settings);
    if (error) return error;
    const current = this.state.data.settings;
    // 같은 값을 다시 적용하면 새 설정 버전을 만들지 않는다.
    if (sameSettings(current, settings)) return null;
    const version = {
      id: crypto.randomUUID(),
      appliedAt: Date.now(),
      settings: { ...settings },
    };
    this.setData({ settings: version.settings, settingsId: version.id });
    // 값이 실제로 바뀌면 진행 중 이탈을 설정 변경으로 닫고 새 구간에서 판정한다.
    if (this.engine && this.engine.state !== "ended")
      this.handle(
        this.engine.applySettings(version.appliedAt, settings, version.id),
      );
    void this.persist((store) => store.addSettingsVersion(version));
    void this.save();
    return null;
  };
  deleteRecords = async (id: string | "all") => {
    const ids = this.state.data.sessions
      .filter((s) => s.state === "ended" && (id === "all" || s.id === id))
      .map((s) => s.id);
    const ok = await this.persist(async (store) => {
      for (const sessionId of ids) await store.deleteSession(sessionId);
    }, DELETE_FAILED);
    if (!ok) return false;
    if (this.engine?.state === "ended" && ids.includes(this.engine.id))
      this.engine = null;
    this.update({
      data: {
        ...this.state.data,
        sessions: this.state.data.sessions.filter((s) => !ids.includes(s.id)),
      },
    });
    return true;
  };

  private onFrame(frame: Frame) {
    if (this.phone) {
      // 원본 영상·좌표는 보내지 않고 측면 각도·품질·측정 시각(서버 시각)만 보낸다.
      if (this.state.connection === "approved") {
        const valid = frame.quality === "valid" && frame.angle != null;
        this.pairing.send({
          type: "side",
          seq: ++this.sideSeq,
          t: this.pairing.toServer(frame.at),
          valid,
          angleDeg: valid ? frame.angle : null,
          earVis: frame.earVis ?? 0,
          shoulderVis: frame.shoulderVis ?? 0,
        });
      }
      this.update({ frame });
      return;
    }
    const { mode, data } = this.state;
    // 측면 입력 품질은 판정 코드(deep.js)의 규칙을 따른다: 없음·정면과 1초 넘게 차이·갱신 중단은 side_stale,
    // 휴대폰이 귀·어깨를 찾지 못하면 side_unrecognized. 시각은 모두 이 기기 기준으로 맞춘 값이다.
    const remote = this.state.remote;
    const sideQ = sideInputQuality(
      this.state.connection === "approved" && remote
        ? { t: remote.at, valid: remote.quality === "valid" }
        : null,
      frame.at,
      { idle: remote?.quality === "stale", maxAgeMs: SIDE_SYNC_MS },
    );
    const side = remote?.angle != null ? { angleDeg: remote.angle } : null;
    const interrupted =
      !!this.lastFrameAt && frame.at - this.lastFrameAt > 2000;
    const running = this.engine?.state === "running" && !!data.baseline;
    // 판정 중에는 기준 등록 때와 같은 배치인지도 확인한다.
    const sensitivity = withDefaults(
      this.engine?.settings ?? data.settings,
    ).sensitivity;
    let judged =
      running && frame.quality === "valid"
        ? evaluate(frame.signals, data.baseline!.signals, sensitivity)
        : null;
    const frontQuality = judged?.quality ?? frame.quality;
    // 딥 모드는 유효하고 동기화된 두 입력만 결합하고, 한쪽이라도 무효이면 그 사유로 판정을 보류한다.
    if (judged && mode === "deep")
      judged = fuse(judged, sideQ, side, data.baseline!.sideAngle, sensitivity);
    const quality =
      judged?.quality ??
      (mode === "deep" && frontQuality === "valid" ? sideQ : frontQuality);
    this.state = {
      ...this.state,
      frame: { ...frame, quality },
      frontValid: frontQuality === "valid",
    };
    if (this.state.collecting) {
      if (interrupted) this.collector = this.newCollector();
      const result = this.collector.push(
        frame.at,
        frontQuality === "valid" ? frame.signals : null,
        sideQ,
        side,
      );
      this.state = {
        ...this.state,
        progress: result.progress,
        notice:
          result.status === "restarted"
            ? RESTART_TEXT[result.reason ?? "front"]
            : "안정된 입력을 확인하고 있어요.",
      };
      if (result.status === "done") {
        // 딥 모드 기준은 정면 특징과 측면 평균 각도를 함께 담는다.
        const { side_angle_deg, ...signals } = result.baseline!;
        const baseline = {
          id: crypto.randomUUID(),
          mode,
          signals: signals as Signals,
          sideAngle: mode === "deep" ? (side_angle_deg ?? null) : null,
          createdAt: frame.at,
        };
        this.setData({ baseline });
        if (this.engine)
          this.handle(this.engine.setBaseline(frame.at, baseline.id));
        this.state = {
          ...this.state,
          collecting: false,
          notice:
            mode === "deep"
              ? "정면·측면 양쪽 기준이 등록됐어요."
              : "기준 자세가 등록됐어요.",
        };
        void this.persist((store) => store.addBaseline(baseline));
        void this.save();
      }
    }
    if (this.engine?.state === "running" && mode === "deep" && this.remoteLost)
      this.handle(this.engine.enterRecovery(frame.at));
    if (this.engine?.state === "running" && data.baseline) {
      if (interrupted) {
        // 탭이 멈춰 프레임이 끊긴 동안은 인식 불가로 넘긴다. 유예 시간보다 길면 판정 보류가 된다.
        this.handle(
          this.engine.tick(this.lastFrameAt + 1, { quality: "unrecognized" }),
        );
        this.handle(
          this.engine.tick(frame.at - 1, { quality: "unrecognized" }),
        );
      }
      const result = {
        quality,
        deviated: quality === "valid" && !!judged?.deviated,
        types: [...(judged?.types ?? [])],
      };
      this.handle(this.engine.tick(frame.at, result));
      if (this.replay?.status === "running") {
        this.replay.tick(frame.at, this.engine);
        this.state = { ...this.state, testStatus: this.replay.text };
      }
      if (frame.at - this.lastSavedAt > 5000) {
        void this.save();
        this.lastSavedAt = frame.at;
      }
    }
    this.lastFrameAt = frame.at;
    this.update();
  }
  private handle(signals: EngineSignal[]) {
    for (const signal of signals) {
      if (signal.type === "warning" || signal.type === "rewarning") {
        this.state = { ...this.state, warning: true };
        if (this.state.data.settings.sound)
          try {
            this.audio ??= new AudioContext();
            void this.audio.resume();
            const oscillator = this.audio.createOscillator(),
              gain = this.audio.createGain();
            gain.gain.value = 0.08;
            oscillator.frequency.value = 660;
            oscillator.connect(gain);
            gain.connect(this.audio.destination);
            oscillator.start();
            oscillator.stop(this.audio.currentTime + 0.18);
          } catch {
            /* 소리 실패가 판정을 중단하지 않음 */
          }
      } else if (signal.type === "clear")
        this.state = { ...this.state, warning: false };
      else if (signal.type === "report")
        this.state = { ...this.state, notice: "리포트가 준비됐어요" };
    }
  }
  /** PC는 QR 토큰을 서버에서 받고, 휴대폰은 QR의 토큰으로 연결을 요청한다. */
  requestPairing = (role: "host" | "phone", token = "") => {
    this.requestId = "";
    this.update({
      token: role === "phone" ? token : "",
      tokenExpiresAt: 0,
      connection: "waiting",
      remote: null,
      phoneStop: "none",
      error: "",
    });
    if (role === "host" && this.pairing.open) {
      // 재발급: 이전 QR과 대기 중 요청은 서버가 무효화한다.
      this.pairing.send({ type: "qr.issue" });
      return;
    }
    this.pairing.connect(role === "host" ? "pc" : "phone", () =>
      this.pairing.send(
        role === "host"
          ? { type: "qr.issue" }
          : { type: "connect.request", token },
      ),
    );
  };
  approvePairing = () =>
    this.pairing.send({ type: "connect.approve", requestId: this.requestId });
  private closePairing() {
    clearTimeout(this.phoneStopTimer);
    this.closeAfterPhoneStop = false;
    this.sideVideo.close();
    this.pairing.close();
    this.update({ connection: "idle", remote: null });
  }
  /** 휴대폰 촬영 종료는 요청과 실제 확인을 구분한다. 서버가 확인·시간 초과를 알려 준다. */
  private stopPhone(close: boolean) {
    const deep =
      this.state.mode === "deep" ||
      !!this.engine?.segments.some((s) => s.mode === "deep");
    if (!deep) {
      if (close) this.closePairing();
      return;
    }
    clearTimeout(this.phoneStopTimer);
    if (this.state.connection !== "approved") {
      if (this.state.phoneStop !== "confirmed")
        this.update({ phoneStop: "unconfirmed" });
      if (close) this.closePairing();
      return;
    }
    this.closeAfterPhoneStop = close;
    this.pairing.send({ type: "stop.request" });
    this.update({ phoneStop: "requested" });
    // 서버 응답조차 없을 때를 위한 대비. 보통은 서버의 stop.confirmed/stop.unconfirmed가 먼저 온다.
    this.phoneStopTimer = setTimeout(
      () => {
        if (this.state.phoneStop === "requested")
          this.update({ phoneStop: "unconfirmed" });
        if (this.closeAfterPhoneStop) this.closePairing();
      },
      (CONNECTION_PILOT.phoneStopSeconds + 2) * 1000,
    );
  }
  private phoneStopped(confirmed: boolean) {
    clearTimeout(this.phoneStopTimer);
    this.sideVideo.close();
    this.update({
      phoneStop: confirmed ? "confirmed" : "unconfirmed",
      connection: "idle",
      remote: null,
    });
    if (this.closeAfterPhoneStop) this.closePairing();
  }
  releasePairing = () => {
    this.closePairing();
    if (this.phone) this.stopCamera();
  };
  reconnect = () => {
    this.rebaseline();
    this.releasePairing();
  };
  fallback = () => {
    if (!this.canFallback) return;
    const t = Date.now();
    this.stopPhone(true);
    this.handle(this.engine!.setMode(t, "basic"));
    this.handle(this.engine!.start(t));
    this.update({ mode: "basic", notice: "기본 모드로 계속 확인해요." });
    void this.save();
  };
  private linkLost(notice: string) {
    this.sideVideo.close();
    if (this.phone) this.stopCamera();
    else if (this.engine?.mode === "deep")
      this.handle(this.engine.enterRecovery(Date.now()));
    if (this.state.phoneStop === "requested")
      this.update({ phoneStop: "unconfirmed" });
    this.update({ connection: "disconnected", remote: null, notice });
    void this.save();
  }
  private onConnection(message: RelayMessage) {
    const text = typeof message.message === "string" ? message.message : "";
    switch (message.type) {
      // PC
      case "qr.issued":
        this.update({
          token: String(message.token),
          tokenExpiresAt: this.pairing.toLocal(Number(message.expiresAt)),
          connection: "waiting",
        });
        break;
      case "connect.requested":
        this.requestId = String(message.requestId);
        this.update({ connection: "requested" });
        break;
      case "connect.canceled":
        this.requestId = "";
        this.update({
          connection: message.reason === "expired" ? "expired" : "used",
        });
        break;
      case "side":
        this.update({
          remote: {
            quality: message.valid ? "valid" : "unrecognized",
            angle:
              typeof message.angleDeg === "number" ? message.angleDeg : null,
            at: this.pairing.toLocal(Number(message.t)),
          },
        });
        break;
      case "link.input-idle":
        // 측면 입력 갱신 중단: 연결은 유지하되 '측면 입력 지연'으로 판정을 보류한다.
        if (this.state.remote)
          this.update({
            remote: { ...this.state.remote, quality: "stale" },
          });
        break;
      case "stop.requested":
        this.update({ phoneStop: "requested" });
        break;
      case "stop.confirmed":
        this.phoneStopped(true);
        break;
      case "stop.unconfirmed":
        this.phoneStopped(false);
        break;
      case "link.lost":
        this.linkLost("휴대폰 연결이 끊겼어요.");
        break;
      // 휴대폰
      case "connect.pending":
        this.update({ connection: "waiting" });
        break;
      case "connect.rejected":
        this.update({
          connection:
            message.code === "expired"
              ? "expired"
              : ["used", "reissued"].includes(String(message.code))
                ? "used"
                : "error",
          error: text,
        });
        break;
      case "stop.request":
        this.stopCamera();
        this.pairing.send({ type: "stop.done", stopId: message.stopId });
        this.update({ notice: "PC에서 감지를 멈춰 카메라를 껐어요." });
        break;
      case "link.closed":
      case "link.revoked":
        this.stopCamera();
        this.pairing.close();
        this.update({
          connection: "idle",
          notice:
            message.reason === "stopped"
              ? "PC에서 감지를 멈춰 카메라를 껐어요."
              : "PC와의 연결이 끝났어요. 다시 쓰려면 PC의 새 QR로 접속해 주세요.",
        });
        break;
      // 양쪽
      case "rtc":
        void this.sideVideo.receive(message).catch(() => {});
        break;
      case "link.approved":
        this.update({ connection: "approved" });
        break;
      case "error":
        if (message.code === "expired") this.update({ connection: "expired" });
        else this.update({ error: text });
        break;
      case "socket.error":
      case "socket.closed":
        if (this.state.connection === "approved")
          this.linkLost("연결 서버와의 연결이 끊겼어요.");
        else if (this.state.connection !== "idle")
          this.update({ connection: "error" });
        break;
    }
  }
  private test(text: string) {
    this.update({ testStatus: text });
  }
  /** 평가 전용 '테스트 도구'. 입력·리포트 주기만 바꾸고 경고·복귀·리포트는 공통 엔진이 만든다. */
  testAccelerate = () => {
    const engine = this.engine;
    const after = `만든 뒤에는 ${POLICY.reportValidSeconds}초 주기로 돌아가요`;
    if (engine && engine.state !== "ended") {
      if (engine.reports.length)
        return this.test("이미 자동 리포트가 있어 가속할 수 없어요");
      this.handle(engine.accelerateFirstReport(Date.now(), ACCEL_SECONDS));
      void this.save();
      return this.test(
        `첫 자동 리포트를 유효 ${ACCEL_SECONDS}초에 만들어요. ${after}`,
      );
    }
    this.accelPending = ACCEL_SECONDS;
    this.test(
      `탐지를 시작하면 첫 자동 리포트를 유효 ${ACCEL_SECONDS}초에 만들어요. ${after}`,
    );
  };
  testReplay = (kind: "front" | "away" | "both") => {
    if (this.engine?.state !== "running")
      return this.test("탐지가 진행 중일 때 쓸 수 있어요");
    if (kind === "both" && !this.simPhone?.approved)
      return this.test("측면 데이터 주입으로 연결된 뒤에 쓸 수 있어요");
    this.replay = createReplay(
      kind === "away" ? "away" : "front",
      (clip) => {
        this.recorded?.show(clip);
        this.simPhone?.show(clip);
      },
      kind === "both" ? "양쪽 이탈·복귀 재생" : undefined,
    );
    this.engine.markTest(this.replay.plan.name);
    this.test(this.replay.text);
  };
  testInjectSide = () => {
    if (!this.state.token || this.state.connection !== "waiting")
      return this.test("PC 연결 화면에서 QR이 준비된 뒤에 쓸 수 있어요");
    this.simPhone?.close();
    this.simPhone = new SimulatedPhone((text) => this.test(text));
    this.simPhone.connect(this.state.token);
    this.sideInjected = true;
  };
  testCutSide = () => {
    if (!this.simPhone?.approved)
      return this.test("측면 데이터 주입으로 연결된 뒤에 쓸 수 있어요");
    this.simPhone.close();
    this.engine?.markTest("측면 연결 끊기");
    this.test(
      "모의 측면 입력과 연결을 끊었어요. 종료 요청에도 응답하지 않아요.",
    );
  };
  dispose = () => {
    if (this.engine && this.engine.state !== "ended") this.pause();
    this.camera.dispose();
    this.sideVideo.close();
    this.pairing.close();
    void this.audio?.close();
  };
}
