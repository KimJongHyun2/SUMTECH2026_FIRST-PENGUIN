import type { Locator } from "@playwright/test"

// 흐름 spec이 함께 쓰는 화면 값 읽기 도우미. 입력은 평가 빌드(/?mode=eval)의 녹화 영상이 공급한다.

/** 화면 값의 숫자 부분 (예: '14초' → 14, '63%' → 63) */
export async function numberIn(locator: Locator): Promise<number> {
  const text = (await locator.textContent()) ?? ""
  return Number(text.match(/-?\d+(\.\d+)?/)?.[0] ?? NaN)
}

/**
 * 화면의 비율(%)이 화면의 D·V(초)와 맞는지. 화면 값은 초·% 단위로 반올림되므로
 * 반올림 전 D·V가 있을 수 있는 범위(±0.5초)에서 나오는 비율(±0.5%) 안에 있으면 맞다고 본다.
 */
export function ratioMatches(D: number, V: number, ratioPercent: number): boolean {
  const low = (Math.max(D - 0.5, 0) / (V + 0.5)) * 100 - 0.5
  const high = (Math.min(D + 0.5, V + 0.5) / Math.max(V - 0.5, 0.5)) * 100 + 0.5
  return ratioPercent >= low && ratioPercent <= high
}

/** 리포트·상세 화면의 항목 값 (예: '확정 이탈' → '1회') */
export function fact(scope: Locator, label: string): Locator {
  const dt = scope.page().locator("dt", { hasText: new RegExp(`^${label}$`) })
  return scope.locator(".facts > div").filter({ has: dt }).locator("dd")
}
