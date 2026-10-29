// 평가 전용 빌드의 입력·재생 계획 (docs/prd.md 7절). posture-web의 eval.js를 그대로 쓴다.
// EVAL_ENABLED=true로 빌드하고 첫 주소가 /?mode=eval일 때만 켜지며, 같은 탭 안에서는 이동·새로고침에도 유지된다.
import {
  EVAL_INPUT_ERROR,
  RecordedInput,
  REPLAYS,
  Replay,
  evalActive,
} from "../../../../posture-web/src/app/eval.js";
export type Clip = "good" | "turtle" | "away";
export interface RecordedSource {
  label: string;
  start(video: HTMLVideoElement): Promise<void>;
  show(clip: Clip): void;
  stop(): void;
}
export interface ReplayRun {
  plan: { name: string };
  status: "running" | "done" | "failed";
  text: string;
  tick(now: number, session: unknown): void;
}
export const EVAL: boolean = evalActive();
export { EVAL_INPUT_ERROR, REPLAYS };
export const createRecorded = () => new RecordedInput() as RecordedSource;
export const createReplay = (
  kind: "front" | "away",
  show: (clip: Clip) => void,
  name?: string,
) => {
  const replay = new Replay(kind, show) as ReplayRun;
  // 양쪽 재생은 정면 재생 계획을 그대로 쓰고 이름만 바꾼다.
  if (name) replay.plan = { ...replay.plan, name };
  return replay;
};
