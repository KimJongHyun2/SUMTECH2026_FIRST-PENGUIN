import type { Locator } from "@playwright/test"

// 흐름 spec이 함께 쓰는 화면 값 읽기 도우미. 입력은 평가 빌드(/?mode=eval)의 녹화 영상이 공급한다.

/** 화면 값의 숫자 부분 (예: '14초' → 14, '63%' → 63) */
export async function numberIn(locator: Locator): Promise<number> {
  const text = (await locator.textContent()) ?? ""
  return Number(text.match(/-?\d+(\.\d+)?/)?.[0] ?? NaN)
}

/** 리포트·상세 화면의 항목 값 (예: '확정 이탈' → '1회') */
export function fact(scope: Locator, label: string): Locator {
  const dt = scope.page().locator("dt", { hasText: new RegExp(`^${label}$`) })
  return scope.locator(".facts > div").filter({ has: dt }).locator("dd")
}
