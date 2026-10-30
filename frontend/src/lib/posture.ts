// 다른 분이 작성한 순수 로직은 수정하지 않는다. 프론트 계약을 이 경계에서 명시한다.
import { SessionEngine } from "../../../posture-web/src/core/engine.js";
import {
  BaselineCollector,
  evaluateFrame,
  frameQuality,
} from "../../../posture-web/src/core/detector.js";
import { windowMetrics } from "../../../posture-web/src/core/report.js";
import {
  DeepBaselineCollector,
  fuseDeep,
  sideQuality,
} from "../../../posture-web/src/core/deep.js";
import type {
  SessionRecord,
  Settings,
  Mode,
  Signals,
  Quality,
  Metrics,
} from "./types";
import { POLICY } from "./policy";
export type EngineSignal = {
  type: "warning" | "rewarning" | "clear" | "report";
};
export interface Engine extends SessionRecord {
  warningActive: boolean;
  candidateMs: number;
  start(t: number): EngineSignal[];
  pause(t: number): EngineSignal[];
  prepare(t: number): EngineSignal[];
  tick(
    t: number,
    input: { quality: Quality; deviated?: boolean; types?: string[] },
  ): EngineSignal[];
  end(t: number, reason?: string): EngineSignal[];
  enterRecovery(t: number): EngineSignal[];
  setMode(t: number, mode: Mode): EngineSignal[];
  beginRebaseline(t: number): EngineSignal[];
  setBaseline(t: number, id: string): EngineSignal[];
  applySettings(t: number, settings: Settings, id: string): EngineSignal[];
  recognition: string;
  // 평가 빌드 전용: 첫 자동 리포트 주기 가속과 테스트 입력 표시
  accelerateFirstReport(t: number, seconds: number): EngineSignal[];
  markTest(label: string): void;
  toJSON(): SessionRecord;
}
const Core = SessionEngine as unknown as {
  new (options: Record<string, unknown>): Engine;
  fromJSON(data: SessionRecord, policy: typeof POLICY): Engine;
};
export const createEngine = (options: Record<string, unknown>) =>
  new Core({ ...options, policy: POLICY });
export const restoreEngine = (data: SessionRecord) =>
  Core.fromJSON(data, POLICY);
export type SideQuality = "valid" | "side_stale" | "side_unrecognized";
export type SideInput = { angleDeg: number } | null;
export type Judged = { quality: Quality; deviated: boolean; types: string[] };
/** 기준 등록 수집 결과. 다시 셀 때 reason은 'front'|'side_stale'|'side_unrecognized'|'side_unstable'이다. */
export type CollectResult = {
  status: "collecting" | "paused" | "restarted" | "done";
  progress: number;
  reason?: string;
  baseline?: Signals & { side_angle_deg?: number };
};
export type Collector = {
  push(
    t: number,
    front: Signals | null,
    sideQ?: SideQuality,
    side?: SideInput,
  ): CollectResult;
};
const collectorOptions = () => ({
  seconds: POLICY.baselineStableSeconds,
  graceSeconds: POLICY.recognitionGraceSeconds,
});
export const createCollector = () =>
  new BaselineCollector(collectorOptions()) as unknown as Collector;
/** 딥 모드 양쪽 기준: 정면·측면이 같은 5초 동안 함께 안정해야 한다(deep.js). */
export const createDeepCollector = () =>
  new DeepBaselineCollector(collectorOptions()) as unknown as Collector;
/** 측면 입력을 정면 입력 시각에 결합할 수 있는지(deep.js와 같은 규칙). 시각은 이 기기 기준으로 맞춘 값이다. */
export const sideInputQuality = (
  side: { t: number; valid: boolean } | null,
  frontTime: number,
  options: { idle: boolean; maxAgeMs: number },
) => sideQuality(side, frontTime, options) as SideQuality;
/** 정면 판정에 측면 입력을 더한다(deep.js). 측면 각도가 기준보다 15°×민감도 배율 이상 줄면 이탈이다. */
export const fuse = (
  front: Judged,
  sideQ: SideQuality,
  side: SideInput,
  baselineAngle: number | null,
  sensitivity: Settings["sensitivity"],
) => fuseDeep(front, sideQ, side, baselineAngle, sensitivity) as Judged;
/** quality는 기준 등록 때의 배치와 다른 입력(뒤쪽의 다른 사람 등)까지 판정한다. */
export const evaluate = (
  signals: Signals | null,
  baseline: Signals,
  sensitivity: Settings["sensitivity"],
) =>
  evaluateFrame(signals, baseline, sensitivity) as {
    quality: Quality;
    deviated: boolean;
    types: string[];
  };
export const quality = (signals: Signals | null) =>
  frameQuality(signals) as Quality;
export const metricsFor = (record: SessionRecord): Metrics =>
  windowMetrics(
    {
      events: record.events,
      warnings: record.warnings,
      candidate: null,
      validNow: record.validMs,
    },
    0,
    record.validMs,
  );
export {
  frontSignals,
  largestPose,
  sideAngle,
  pitchFromMatrix,
} from "../../../posture-web/src/signals.js";
export {
  RECOGNITION_LABELS,
  SESSION_STATE_LABELS,
} from "../../../posture-web/src/core/engine.js";
