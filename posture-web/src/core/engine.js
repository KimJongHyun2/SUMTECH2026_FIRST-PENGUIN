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
  away: '자리 비움 · 판정 보류',
  unrecognized: '인식 불가 · 판정 보류',
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
    this.holds = [];
    this.openHold = null;
    this.invalidSince = null;
    this.stops = [];
    this.reports = [];
    this.segments = [{ fromValid: 0, at: startedAt, mode, baselineId, settingsVersionId }];
    this.episode = null;
    // 현재 리포트 구간: [windowStart, nextBoundary) (유효 시간 ms). windowStartedAt은 그 구간의 첫 유효 입력 시각.
    this.windowStart = 0;
    this.windowStartedAt = null;
    this.nextBoundary = policy.reportValidSeconds * 1000;
    // 평가 빌드의 테스트 입력·주기 표시 (docs/prd.md 7절). 운영 기록과 구분해 리포트에 남긴다.
    this.testMarks = [];
    this.reportAccel = null;
    this.endedAt = null;
    this.endReason = null;
    this.seq = 0;
    this.outbox = [];
  }

  get reportMs() { return this.policy.reportValidSeconds * 1000; }
  get warningMs() { return this.settings.warningSeconds * 1000; }
  get rewarningMs() { return this.settings.rewarningSeconds * 1000; }
  get recoveryMs() { return this.policy.recoverySeconds * 1000; }
  get graceMs() { return (this.policy.recognitionGraceSeconds ?? 0) * 1000; }
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
      // 짧은 가림(유예 시간 이하)은 판정·유효 시간만 멈추고 연속 타이머는 그대로 둔다.
      this.invalidSince ??= t;
      if (t - this.invalidSince <= this.graceMs) return this.#drain();
      // 그보다 길면 판정 보류: 후보는 버리고 확정 이탈은 그 사유로 닫는다. 확정 이탈 유무와 별개로 보류 구간을 남긴다.
      if (this.openHold?.reason !== quality) {
        const startAt = this.openHold ? t : this.invalidSince;
        this.#closeHold(t);
        this.openHold = { reason: quality, startAt, endAt: null, validAt: this.validMs };
      }
      this.#closeEpisode(quality, t);
      return this.#drain();
    }
    this.invalidSince = null;
    this.#closeHold(t);

    const prev = this.validMs;
    this.validMs += dt;
    this.windowStartedAt ??= t - dt;

    this.#updateEpisode(t, prev, dt, deviated, types);
    while (this.validMs >= this.nextBoundary) {
      this.#createReport('auto', t, this.windowStart, this.nextBoundary);
      this.windowStart = this.nextBoundary;
      this.windowStartedAt = t;
      // 테스트 가속은 첫 생성 후 해제하고, 마지막 경계부터 운영 주기(1800초)로 돌아간다.
      if (this.reportAccel && !this.reportAccel.released) this.reportAccel.released = true;
      this.nextBoundary = this.windowStart + this.reportMs;
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

  #closeHold(t) {
    if (!this.openHold) return;
    this.holds.push({ ...this.openHold, endAt: t });
    this.openHold = null;
  }

  /**
   * 진행을 끊는 사용자·시스템 동작: 보류 구간과 열린 이탈을 닫고, 이탈 유무와 별개로 세션 중단 기록을 남긴다.
   * (일시 정지·설정/기준/모드 변경·연결 장애. 종료는 세션 상태로 남는다)
   */
  #stop(reason, t) {
    this.invalidSince = null;
    this.#closeHold(t);
    this.#closeEpisode(reason, t);
    if (reason !== 'ended') this.stops.push({ reason, at: t, validAt: this.validMs, mode: this.mode });
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
      this.invalidSince = null;
    }
    return this.#drain();
  }

  pause(t) {
    if (this.state === 'running') {
      this.#stop('paused', t);
      this.state = 'paused';
      this.recognition = 'none';
    }
    return this.#drain();
  }

  /** 재개는 장치·기준 확인 뒤 시작하므로 먼저 준비 상태로 돌린다. */
  prepare(t) {
    if (this.state !== 'ended') {
      if (this.state === 'running') this.#stop('paused', t);
      this.state = 'ready';
      this.recognition = 'none';
      this.lastT = null;
    }
    return this.#drain();
  }

  applySettings(t, settings, settingsVersionId) {
    this.#stop('settings_change', t);
    this.settings = settings;
    this.#segment(t, { settingsVersionId });
    return this.#drain();
  }

  /** 기준 다시 등록: 진행 이탈을 기준 변경으로 닫고 준비로. "탐지 재개" 전에는 자동 재개하지 않는다. */
  beginRebaseline(t) {
    this.#stop('baseline_change', t);
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
      this.#stop('mode_change', t);
      this.mode = mode;
      this.#segment(t, { mode });
    }
    return this.#drain();
  }

  /** 딥 모드 연결 장애: 판정·유효 시간을 멈추고 복구 대기 */
  enterRecovery(t) {
    if (this.state === 'running') {
      this.#stop('disconnected', t);
      this.state = 'recovering';
      this.recognition = 'none';
    }
    return this.#drain();
  }

  /** 평가 빌드의 '[테스트용] 리포트 3초 가속': 첫 자동 주기만 바꾼다. 등록·경고·복귀·재경고 시간은 그대로다. */
  accelerateFirstReport(t, seconds) {
    if (this.state === 'ended' || this.reports.length > 0) return this.#drain();
    this.reportAccel = { firstSeconds: seconds, appliedAt: t, released: false };
    this.nextBoundary = this.windowStart + seconds * 1000;
    this.markTest(`리포트 ${seconds}초 가속(첫 주기)`);
    return this.#drain();
  }

  markTest(label) {
    if (!this.testMarks.includes(label)) this.testMarks.push(label);
  }

  end(t, reason = 'user') {
    if (this.state === 'ended') return this.#drain();
    this.#stop('ended', t);
    if (this.validMs > this.windowStart) {
      this.#createReport('final', t, this.windowStart, this.validMs);
    } else if (this.validMs === 0 && this.reports.length === 0) {
      this.#createReport('empty', t, 0, 0);
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
    return {
      events: this.events,
      warnings: this.warnings,
      holds: this.openHold ? [...this.holds, this.openHold] : this.holds,
      candidate: this.episode?.status === 'candidate' ? this.episode : null,
      validNow: this.validMs,
      segments: this.segments,
    };
  }

  /** @returns [start, end, options] 자동 리포트는 [시작, 끝), 종료 리포트는 끝 시점의 보류까지 포함 */
  #window(report) {
    return [report.startValid, report.endValid, { includeEnd: report.kind !== 'auto' }];
  }

  #createReport(kind, t, start, end) {
    const index = this.reports.filter((r) => r.kind === 'auto').length;
    const report = {
      id: `${this.id}-w${this.reports.length}`,
      sessionId: this.id,
      index,
      kind,
      revision: 1,
      createdAt: t,
      updatedAt: t,
      startAt: this.windowStartedAt ?? t,
      endAt: t,
      mode: this.mode,
      startValid: start,
      endValid: Math.max(end, start),
      test: [...this.testMarks],
    };
    const [, , options] = this.#window(report);
    report.metrics = windowMetrics(this.#ledger(), report.startValid, report.endValid, options);
    this.reports.push(report);
    this.outbox.push({ type: 'report', reportId: report.id, kind });
  }

  /** 늦은 확정·후보 해제로 이미 만든 구간이 바뀌면 같은 리포트 ID의 revision을 올린다. */
  #refreshReports(t) {
    for (const report of this.reports) {
      if (report.kind !== 'auto') continue;
      const [start, end, options] = this.#window(report);
      const metrics = windowMetrics(this.#ledger(), start, end, options);
      if (JSON.stringify(metrics) !== JSON.stringify(report.metrics)) {
        report.metrics = metrics;
        report.revision += 1;
        report.updatedAt = t;
      }
    }
  }

  /** 진행 중 화면 표시용: 아직 리포트로 닫히지 않은 현재 구간 */
  currentWindowMetrics() {
    return windowMetrics(this.#ledger(), this.windowStart, this.validMs);
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
    // 구간 시작을 따로 저장하기 전의 기록: 운영 주기만 있었으므로 마지막 경계에서 계산한다.
    engine.windowStart ??= data.nextBoundary - policy.reportValidSeconds * 1000;
    engine.windowStartedAt ??= null;
    engine.testMarks ??= [];
    engine.policy = policy;
    engine.outbox = [];
    if (data.episode) engine.episode = { ...data.episode, types: new Set(data.episode.types) };
    return engine;
  }
}
