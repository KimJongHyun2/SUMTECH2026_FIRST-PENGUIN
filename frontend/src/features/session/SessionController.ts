import { CameraService } from "../camera/CameraService";
import {
  PairingService,
  type ConnectionMessage,
} from "../connection/PairingService";
import { loadData, freshData, type RecordStore } from "../history/storage";
import {
  createEngine,
  createCollector,
  evaluate,
  type Engine,
  type EngineSignal,
} from "../../lib/posture";
import {
  CONNECTION_PILOT,
  changesJudgment,
  sameSettings,
  validateSettings,
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
// 측면 입력이 2초 넘게 오지 않으면 판정을 보류하고, 연결 감시 시간(파일럿)을 넘기면 복구 대기로 둔다.
const SIDE_STALE_MS = 2000;
const SIDE_LOST_MS = CONNECTION_PILOT.disconnectSeconds * 1000;

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
  tokenIssuedAt: number;
  remote: { quality: string; angle: number | null; at: number } | null;
  phoneStop: "none" | "requested" | "confirmed" | "unconfirmed";
}
export class SessionController {
  readonly camera: CameraService;
  readonly pairing: PairingService;
  private listeners = new Set<() => void>();
  private engine: Engine | null = null;
  private collector = createCollector();
  private sideSamples: number[] = [];
  private store: RecordStore | null = null;
  private writes: Promise<unknown>;
  private pendingWrites = 0;
  private saveBlocked = false;
  private lastSavedAt = 0;
  private lastFrameAt = 0;
  private cameraRequest = 0;
  private phoneStopTimer?: ReturnType<typeof setTimeout>;
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
      tokenIssuedAt: 0,
      remote: null,
      phoneStop: "none",
    };
    this.camera = new CameraService((frame) => this.onFrame(frame));
    this.pairing = new PairingService((message) => this.onConnection(message));
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
    this.update({
      mode,
      confirmed: false,
      collecting: false,
      progress: 0,
      warning: false,
      error: "",
      notice: "",
      phoneStop: "none",
    });
  };
  confirmPlacement = (confirmed: boolean) => this.update({ confirmed });
  private stopCamera() {
    this.cameraRequest++;
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
      await this.camera.start(this.phone);
      if (request !== this.cameraRequest) return;
      this.lastFrameAt = 0;
      this.update({
        cameraStatus: "on",
        confirmed: false,
        notice: "카메라 배치와 앉은 자세를 확인해 주세요.",
      });
    } catch (error) {
      if (request !== this.cameraRequest) return;
      const e = error as Error;
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
    this.collector = createCollector();
    this.sideSamples = [];
    this.setData({ baseline: null });
    this.update({
      collecting: true,
      progress: 0,
      notice: "5초 동안 편안하게 자세를 유지해 주세요.",
    });
  };
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
    if (this.engine && changesJudgment(current, settings))
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
      this.pairing.send({
        type: "sample",
        quality: frame.quality,
        angle: frame.angle,
      });
      this.update({ frame });
      return;
    }
    const { mode, data } = this.state;
    const sideOK = mode !== "deep" || this.remoteValid;
    const interrupted =
      !!this.lastFrameAt && frame.at - this.lastFrameAt > 2000;
    const running = this.engine?.state === "running" && !!data.baseline;
    // 판정 중에는 기준 등록 때와 같은 배치인지도 확인한다.
    const judged =
      running && frame.quality === "valid"
        ? evaluate(frame.signals, data.baseline!.signals)
        : null;
    const frontQuality = judged?.quality ?? frame.quality;
    const quality = sideOK ? frontQuality : "unrecognized";
    this.state = {
      ...this.state,
      frame: { ...frame, quality },
      frontValid: frontQuality === "valid",
    };
    if (this.state.collecting) {
      if (interrupted) {
        this.collector = createCollector();
        this.sideSamples = [];
      }
      let sample = quality === "valid" ? frame.signals : null;
      const angle = this.state.remote?.angle;
      if (mode === "deep" && this.sideSamples.length && angle != null) {
        const mean =
          this.sideSamples.reduce((a, b) => a + b, 0) / this.sideSamples.length;
        if (Math.abs(mean - angle) > 5) sample = null; // 파일럿 안정성 기준, 실기기 검증 필요
      }
      const result = this.collector.push(frame.at, sample);
      if (result.status === "restarted") this.sideSamples = [];
      else if (mode === "deep" && angle != null) this.sideSamples.push(angle);
      this.state = {
        ...this.state,
        progress: result.progress,
        notice:
          result.status === "restarted"
            ? "입력이나 자세가 바뀌어 다시 5초를 확인해요."
            : "안정된 입력을 확인하고 있어요.",
      };
      if (result.status === "done") {
        const baseline = {
          id: crypto.randomUUID(),
          mode,
          signals: result.baseline as Signals,
          sideAngle: this.sideSamples.length
            ? this.sideSamples.reduce((a, b) => a + b, 0) /
              this.sideSamples.length
            : null,
          createdAt: frame.at,
        };
        this.setData({ baseline });
        if (this.engine)
          this.handle(this.engine.setBaseline(frame.at, baseline.id));
        this.state = {
          ...this.state,
          collecting: false,
          notice: "기준 자세가 등록됐어요.",
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
      if (
        mode === "deep" &&
        quality === "valid" &&
        data.baseline.sideAngle != null &&
        this.state.remote?.angle != null &&
        data.baseline.sideAngle - this.state.remote.angle > 10
      ) {
        result.deviated = true;
        result.types.push("side_angle");
      }
      this.handle(this.engine.tick(frame.at, result));
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
  requestPairing = (
    role: "host" | "phone",
    token: string = crypto.randomUUID(),
  ) => {
    this.update({
      token,
      tokenIssuedAt: Date.now(),
      connection: "waiting",
      remote: null,
      phoneStop: "none",
    });
    this.pairing.open(role, token);
    return token;
  };
  approvePairing = () => this.pairing.send({ type: "approve" });
  private closePairing() {
    clearTimeout(this.phoneStopTimer);
    this.closeAfterPhoneStop = false;
    this.pairing.close();
    this.update({ connection: "idle", remote: null });
  }
  /** 휴대폰 촬영 종료는 요청과 실제 확인을 구분한다. 응답이 없으면 '확인 안 됨'으로 남긴다. */
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
      this.update({ phoneStop: "unconfirmed" });
      if (close) this.closePairing();
      return;
    }
    this.closeAfterPhoneStop = close;
    this.pairing.send({ type: "stop" });
    this.update({ phoneStop: "requested" });
    this.phoneStopTimer = setTimeout(() => {
      if (this.state.phoneStop === "requested")
        this.update({ phoneStop: "unconfirmed" });
      if (this.closeAfterPhoneStop) this.closePairing();
    }, CONNECTION_PILOT.phoneStopSeconds * 1000);
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
  private onConnection(message: ConnectionMessage) {
    if (message.type === "ready") this.update({ connection: "waiting" });
    if (message.type === "request") this.update({ connection: "requested" });
    if (message.type === "approved") this.update({ connection: "approved" });
    if (message.type === "expired") this.update({ connection: "expired" });
    if (["used", "unavailable"].includes(message.type))
      this.update({ connection: "used" });
    if (message.type === "sample")
      this.update({
        remote: {
          quality: message.quality ?? "unrecognized",
          angle: message.angle ?? null,
          at: Date.now(),
        },
      });
    if (message.type === "stop") {
      this.stopCamera();
      this.pairing.send({ type: "stopped" });
      this.update({ notice: "PC에서 감지를 멈춰 카메라를 껐어요." });
    }
    if (message.type === "stopped") {
      clearTimeout(this.phoneStopTimer);
      this.update({ phoneStop: "confirmed" });
      if (this.closeAfterPhoneStop) this.closePairing();
    }
    if (["error", "disconnected"].includes(message.type)) {
      if (this.phone) this.stopCamera();
      else if (this.engine?.mode === "deep")
        this.handle(this.engine.enterRecovery(Date.now()));
      if (this.state.phoneStop === "requested")
        this.update({ phoneStop: "unconfirmed" });
      this.update({
        connection: message.type === "error" ? "error" : "disconnected",
        remote: null,
      });
      void this.save();
    }
  }
  dispose = () => {
    if (this.engine && this.engine.state !== "ended") this.pause();
    this.camera.dispose();
    this.pairing.close();
    void this.audio?.close();
  };
}
