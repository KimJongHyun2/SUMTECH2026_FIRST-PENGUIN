// 세션 진행·이탈 원장·리포트 (F2·F3·F6). 화면·카메라·저장과 분리된 순수 로직이다.
// 시간은 두 가지를 쓴다: 실제 시각 t(ms)와 "유효 입력 누적 시간" valid(ms).
// 유효 입력에서만 연속 시간을 센다. 가림·정지·기준/설정/모드 변경·종료는 중단이며 정상 복귀가 아니다.
import { POLICY } from './policy.js';
import { windowMetrics } from './report.js';

// 탭이 잠깐 멈췄다 돌아와도 그 사이를 유효 시간으로 몰아 세지 않는다.
const MAX_STEP_MS = 2000;

export const SESSION_STATE_LABELS = {
  ready: '준비',
  running: '진행',
  paused: '사용자 정지',
  recovering: '복구 대기',
  ended: '종료',
};

export const RECOGNITION_LABELS = {
  none: '-',
  valid: '유효',
  away: '자리 비움',
  unrecognized: '인식 불가',
};

export class SessionEngine {
  constructor({ id, startedAt, mode = 'basic', baselineId, settingsVersionId, settings, policy = POLICY }) {
    this.id = id;
    this.startedAt = startedAt;
    this.policy = policy;
    this.settings = settings;
    this.mode = mode;
    this.state = 'ready';
    this.recognition = 'none';
    this.validMs = 0;
    this.lastT = null;
    this.events = [];
    this.warnings = [];
    this.reports = [];
    this.windowStartAt = [];
    this.segments = [{ fromValid: 0, at: startedAt, mode, baselineId, settingsVersionId }];
    this.episode = null;
    this.nextBoundary = policy.reportValidSeconds * 1000;
    this.endedAt = null;
    this.endReason = null;
    this.seq = 0;
    this.outbox = [];
  }

  get reportMs() { return this.policy.reportValidSeconds * 1000; }
  get warningMs() { return this.settings.warningSeconds * 1000; }
  get rewarningMs() { return this.settings.rewarningSeconds * 1000; }
  get recoveryMs() { return this.policy.recoverySeconds * 1000; }
  get warningActive() { return this.episode?.status === 'confirmed'; }
  get candidateMs() { return this.episode?.status === 'candidate' ? this.episode.candidateMs : 0; }
  get currentSegment() { return this.segments.at(-1); }

  // ------------------------------------------------------------ 진행

  /**
   * 한 번의 측정 결과를 반영하고, 화면이 처리할 신호 목록을 돌려준다.
   * 신호: { type: 'warning'|'rewarning'|'clear'|'report', ... }
   */
  tick(t, { quality, deviated = false, types = [] }) {
    const dt = this.lastT === null ? 0 : Math.min(Math.max(t - this.lastT, 0), MAX_STEP_MS);
    this.lastT = t;
    if (this.state !== 'running') return this.#drain();
    this.recognition = quality;
    if (quality !== 'valid') {
      this.#closeEpisode(quality, t);
      return this.#drain();
    }

    const prev = this.validMs;
    this.validMs += dt;
    const windowIndex = Math.floor(prev / this.reportMs);
    if (this.windowStartAt[windowIndex] === undefined) this.windowStartAt[windowIndex] = t - dt;

    this.#updateEpisode(t, prev, dt, deviated, types);
    while (this.validMs >= this.nextBoundary) {
      const index = this.nextBoundary / this.reportMs - 1;
      this.#createReport(index, 'auto', t);
      this.nextBoundary += this.reportMs;
    }
    return this.#drain();
  }

  #updateEpisode(t, prev, dt, deviated, types) {
    const ep = this.episode;
    if (deviated) {
      if (!ep) {
        this.episode = {
          id: this.#newId('ev'), status: 'candidate', onsetValid: prev, onsetAt: t - dt,
          candidateMs: dt, recoverMs: 0, types: new Set(types), lastWarnValid: null,
        };
        this.#maybeConfirm(t);
        return;
      }
      types.forEach((x) => ep.types.add(x));
      ep.recoverMs = 0;
      if (ep.status === 'candidate') {
        ep.candidateMs += dt;
        this.#maybeConfirm(t);
      } else if (this.validMs - ep.lastWarnValid >= this.rewarningMs) {
        ep.lastWarnValid = this.validMs;
        this.#warn(ep, 'rewarning', t);
      }
      return;
    }
    if (!ep) return;
    if (ep.status === 'candidate') {
      // 지속 조건 전에 돌아온 후보는 확정 이탈·경고로 집계하지 않는다.
      this.episode = null;
      this.#refreshReports(t);
      return;
    }
    ep.recoverMs += dt;
    // 복귀 확인 3초는 확정 이탈 끝까지 포함한다.
    if (ep.recoverMs >= this.recoveryMs) this.#closeEpisode('normal_return', t);
  }

  #maybeConfirm(t) {
    const ep = this.episode;
    if (ep.candidateMs < this.warningMs) return;
    ep.status = 'confirmed';
    ep.confirmedValid = this.validMs;
    ep.confirmedAt = t;
    ep.lastWarnValid = this.validMs;
    this.events.push({
      id: ep.id, onsetValid: ep.onsetValid, onsetAt: ep.onsetAt, confirmedValid: this.validMs, confirmedAt: t,
      endValid: null, endAt: null, endReason: null, types: [...ep.types],
      baselineId: this.currentSegment.baselineId, settingsVersionId: this.currentSegment.settingsVersionId,
      mode: this.mode,
    });
    this.#warn(ep, 'first', t);
    this.#refreshReports(t);
  }

  #warn(ep, kind, t) {
    this.warnings.push({ eventId: ep.id, kind, valid: this.validMs, at: t });
    this.outbox.push({ type: kind === 'first' ? 'warning' : 'rewarning', eventId: ep.id });
  }

  #closeEpisode(reason, t) {
    const ep = this.episode;
    if (!ep) return;
    this.episode = null;
    if (ep.status === 'confirmed') {
      const event = this.events.find((e) => e.id === ep.id);
      event.endValid = this.validMs;
      event.endAt = t;
      event.endReason = reason;
      event.types = [...ep.types];
      this.outbox.push({ type: 'clear', eventId: ep.id, reason });
    }
    this.#refreshReports(t);
  }

  // ------------------------------------------------------------ 상태 전환 (F3·F5·F1·F10)
  // 모두 tick()처럼 화면이 처리할 신호(예: 경고 해제)를 바로 돌려준다.

  /** 준비 → 진행. 배치 확인이 끝났을 때 부른다. */
  start(t) {
    if (this.state !== 'ended') {
      this.state = 'running';
      this.lastT = t;
    }
    return this.#drain();
  }

  pause(t) {
    if (this.state === 'running') {
      this.#closeEpisode('paused', t);
      this.state = 'paused';
      this.recognition = 'none';
    }
    return this.#drain();
  }

  /** 재개는 장치·기준 확인 뒤 시작하므로 먼저 준비 상태로 돌린다. */
  prepare(t) {
    if (this.state !== 'ended') {
      if (this.state === 'running') this.#closeEpisode('paused', t);
      this.state = 'ready';
      this.recognition = 'none';
      this.lastT = null;
    }
    return this.#drain();
  }

  applySettings(t, settings, settingsVersionId) {
    this.#closeEpisode('settings_change', t);
    this.settings = settings;
    this.#segment(t, { settingsVersionId });
    return this.#drain();
  }

  /** 기준 다시 등록: 진행 이탈을 기준 변경으로 닫고 준비로. "탐지 재개" 전에는 자동 재개하지 않는다. */
  beginRebaseline(t) {
    this.#closeEpisode('baseline_change', t);
    this.state = 'ready';
    this.recognition = 'none';
    this.lastT = null;
    return this.#drain();
  }

  setBaseline(t, baselineId) {
    this.#segment(t, { baselineId });
    return this.#drain();
  }

  setMode(t, mode) {
    if (mode !== this.mode) {
      this.#closeEpisode('mode_change', t);
      this.mode = mode;
      this.#segment(t, { mode });
    }
    return this.#drain();
  }

  /** 딥 모드 연결 장애: 판정·유효 시간을 멈추고 복구 대기 */
  enterRecovery(t) {
    if (this.state === 'running') {
      this.#closeEpisode('disconnected', t);
      this.state = 'recovering';
      this.recognition = 'none';
    }
    return this.#drain();
  }

  end(t, reason = 'user') {
    if (this.state === 'ended') return this.#drain();
    this.#closeEpisode('ended', t);
    const lastBoundary = this.nextBoundary - this.reportMs;
    if (this.validMs > lastBoundary) {
      this.#createReport(lastBoundary / this.reportMs, 'final', t);
    } else if (this.validMs === 0 && this.reports.length === 0) {
      this.#createReport(0, 'empty', t);
    }
    this.state = 'ended';
    this.recognition = 'none';
    this.endedAt = t;
    this.endReason = reason;
    return this.#drain();
  }

  #segment(t, change) {
    this.segments.push({ ...this.currentSegment, ...change, fromValid: this.validMs, at: t });
  }

  // ------------------------------------------------------------ 리포트

  #ledger() {
    return { events: this.events, warnings: this.warnings, candidate: this.episode?.status === 'candidate' ? this.episode : null, validNow: this.validMs };
  }

  #window(report) {
    const start = report.index * this.reportMs;
    const end = report.kind === 'auto' ? start + this.reportMs : this.validMs;
    return [start, Math.max(end, start)];
  }

  #createReport(index, kind, t) {
    const report = {
      id: `${this.id}-w${index}`,
      sessionId: this.id,
      index,
      kind,
      revision: 1,
      createdAt: t,
      updatedAt: t,
      startAt: this.windowStartAt[index] ?? t,
      endAt: t,
      mode: this.mode,
    };
    const [start, end] = this.#window(report);
    report.startValid = start;
    report.endValid = end;
    report.metrics = windowMetrics(this.#ledger(), start, end);
    this.reports.push(report);
    this.outbox.push({ type: 'report', reportId: report.id, kind });
  }

  /** 늦은 확정·후보 해제로 이미 만든 구간이 바뀌면 같은 리포트 ID의 revision을 올린다. */
  #refreshReports(t) {
    for (const report of this.reports) {
      if (report.kind !== 'auto') continue;
      const [start, end] = this.#window(report);
      const metrics = windowMetrics(this.#ledger(), start, end);
      if (JSON.stringify(metrics) !== JSON.stringify(report.metrics)) {
        report.metrics = metrics;
        report.revision += 1;
        report.updatedAt = t;
      }
    }
  }

  /** 진행 중 화면 표시용: 아직 리포트로 닫히지 않은 현재 구간 */
  currentWindowMetrics() {
    const start = (this.nextBoundary - this.reportMs);
    return windowMetrics(this.#ledger(), start, this.validMs);
  }

  // ------------------------------------------------------------ 저장·복원

  #newId(prefix) {
    this.seq += 1;
    return `${this.id}-${prefix}${this.seq}`;
  }

  #drain() {
    const out = this.outbox;
    this.outbox = [];
    return out;
  }

  toJSON() {
    const { policy, outbox, episode, ...rest } = this;
    return {
      ...rest,
      episode: episode ? { ...episode, types: [...episode.types] } : null,
    };
  }

  static fromJSON(data, policy = POLICY) {
    const engine = new SessionEngine({ id: data.id, startedAt: data.startedAt, settings: data.settings, policy });
    Object.assign(engine, data);
    engine.policy = policy;
    engine.outbox = [];
    if (data.episode) engine.episode = { ...data.episode, types: new Set(data.episode.types) };
    return engine;
  }
}
