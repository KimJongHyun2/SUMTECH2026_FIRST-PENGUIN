// 정책값·설정 기본값·민감도 배율은 posture-web core(policy.js) 하나를 따른다. 민감도 경계는 실측 전 파일럿 값이다.
import {
  POLICY as CORE_POLICY,
  CONNECTION_PILOT,
  DEFAULT_SETTINGS as CORE_DEFAULTS,
  SENSITIVITY,
  WARNING_TEXT,
  POSITIVE_INTEGER_ERROR,
  sameSettings as sameCore,
  validateSettings as validateCore,
  withDefaults as withCoreDefaults,
} from "../../../posture-web/src/core/policy.js";
import type { Settings } from "./types";
export { CONNECTION_PILOT, SENSITIVITY, WARNING_TEXT };
export const POLICY = CORE_POLICY;
export const DEFAULT_SETTINGS = CORE_DEFAULTS as Settings;
/** 예전에 저장된 설정(시간 값만 있음)도 기본 민감도·소리로 채워 쓴다. */
export const withDefaults = (settings: Partial<Settings>) =>
  withCoreDefaults(settings) as Settings;
export function validateSettings(input: Settings): string | null {
  if (!validateCore(input).ok) return POSITIVE_INTEGER_ERROR;
  if (!(input.sensitivity in SENSITIVITY)) return "민감도를 선택해 주세요";
  return null;
}
/** 같은 값 재적용은 새 버전·구간을 만들지 않는다. */
export const sameSettings = (a: Settings, b: Settings): boolean =>
  sameCore(a, b);
