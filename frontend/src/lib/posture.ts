// 다른 분이 작성한 순수 로직은 수정하지 않는다. 프론트 계약을 이 경계에서 명시한다.
import { SessionEngine } from "../../../posture-web/src/core/engine.js";
import {
  BaselineCollector,
  evaluateFrame,
  frameQuality,
} from "../../../posture-web/src/core/detector.js";
import { windowMetrics } from "../../../posture-web/src/core/report.js";
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
export const createCollector = () =>
  new BaselineCollector({
    seconds: POLICY.baselineStableSeconds,
    graceSeconds: POLICY.recognitionGraceSeconds,
  });
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
