export function won(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}

/** "+12,000원" / "−3,000원" */
export function signedWon(n: number): string {
  return `${n >= 0 ? "+" : "−"}${won(Math.abs(n))}`;
}

export function targetLabel(target: string): string {
  return target === "전체" ? "전체" : `${target} 전용`;
}
