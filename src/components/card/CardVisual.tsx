import type { Card } from "@/lib/types";
import styles from "./CardVisual.module.css";

// 카드 이미지가 없어 카드사별 색으로 실물 카드 비율(가로:세로 = 1:1.58)의 그림을 그린다
const PALETTE = [
  ["#3a6df0", "#7aa2ff"],
  ["#0f9d8a", "#58d1b9"],
  ["#5b4bd6", "#9b8cff"],
  ["#e0663c", "#ffa47d"],
  ["#2e3a4d", "#6b7a92"],
  ["#c2307a", "#f07ab4"],
];

function colorsFor(key: string) {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function CardVisual({ card, size = "md" }: { card: Card; size?: "md" | "lg" }) {
  const [from, to] = colorsFor(card.issuer);
  return (
    <div
      className={`${styles.visual} ${styles[size]}`}
      style={{ background: `linear-gradient(160deg, ${from}, ${to})` }}
      aria-hidden
    >
      <span className={styles.chip} />
      <span className={styles.issuer}>{card.issuer}</span>
      <span className={styles.type}>{card.type}</span>
    </div>
  );
}
