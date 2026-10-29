export type Mode = "basic" | "deep";
export type Quality = "valid" | "away" | "unrecognized" | "none";
export interface Settings {
  sensitivity: "low" | "normal" | "high";
  warningSeconds: number;
  rewarningSeconds: number;
  sound: boolean;
}
export interface Signals {
  head_forward: number;
  neck_len: number;
  ear_vis: number;
  shoulder_vis: number;
  pitch_deg: number | null;
  // 배치 확인용: 기준 등록 때와 같은 자리·크기인지(뒤쪽의 다른 사람이 아닌지) 본다.
  shoulder_w?: number;
  center_x?: number;
  center_y?: number;
}
export interface Baseline {
  id: string;
  mode: Mode;
  signals: Signals;
  sideAngle: number | null;
  createdAt: number;
}
export interface Segment {
  mode: Mode;
  baselineId: string;
  settingsVersionId: string;
  fromValid: number;
  at: number;
}
export interface PostureEvent {
  id: string;
  onsetValid: number;
  endValid: number | null;
  endReason: string | null;
  types: string[];
}
export interface Warning {
  valid: number;
  kind: string;
  at: number;
  eventId: string;
}
export interface Metrics {
  validSeconds: number;
  deviationSeconds: number;
  ratio: number | null;
  newEvents: number;
  normalReturns: number;
  interruptions: number;
  firstWarnings: number;
  rewarnings: number;
}
export interface Report {
  id: string;
  kind: string;
  startValid: number;
  endValid: number;
  revision: number;
  metrics: Metrics;
}
export interface SessionRecord {
  id: string;
  startedAt: number;
  endedAt: number | null;
  lastT: number | null;
  state: "ready" | "running" | "paused" | "recovering" | "ended";
  mode: Mode;
  validMs: number;
  events: PostureEvent[];
  warnings: Warning[];
  reports: Report[];
  segments: Segment[];
  settings: Settings;
}
export interface StoredData {
  settings: Settings;
  settingsId: string;
  baseline: Baseline | null;
  sessions: SessionRecord[];
}
export interface Frame {
  quality: Quality;
  signals: Signals | null;
  angle: number | null;
  at: number;
}
