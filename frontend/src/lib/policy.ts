// 정책값은 posture-web core(policy.js) 하나를 따른다. 민감도·소리는 화면 설정이고 판정 경계는 실측 후 정한다.
import {
  POLICY as CORE_POLICY,
  CONNECTION_PILOT,
  DEFAULT_SETTINGS as CORE_DEFAULTS,
  WARNING_TEXT,
  POSITIVE_INTEGER_ERROR,
  validateSettings as validateCore,
} from "../../../posture-web/src/core/policy.js";
import type { Settings } from "./types";
export { CONNECTION_PILOT, WARNING_TEXT };
export const POLICY = CORE_POLICY;
export const DEFAULT_SETTINGS: Settings = {
  ...CORE_DEFAULTS,
  sensitivity: "normal",
  sound: true,
};
export function validateSettings(input: Settings): string | null {
  const { warningSeconds, rewarningSeconds } = input;
  if (!validateCore({ warningSeconds, rewarningSeconds }).ok)
    return POSITIVE_INTEGER_ERROR;
  if (!["low", "normal", "high"].includes(input.sensitivity))
    return "민감도를 선택해 주세요";
  return null;
}
export const sameSettings = (a: Settings, b: Settings) =>
  a.warningSeconds === b.warningSeconds &&
  a.rewarningSeconds === b.rewarningSeconds &&
  a.sensitivity === b.sensitivity &&
  a.sound === b.sound;
/** 경고 시간·재경고 간격이 바뀌면 진행 중 이탈을 설정 변경으로 닫고 새 구간을 시작한다. */
export const changesJudgment = (a: Settings, b: Settings) =>
  a.warningSeconds !== b.warningSeconds ||
  a.rewarningSeconds !== b.rewarningSeconds;
