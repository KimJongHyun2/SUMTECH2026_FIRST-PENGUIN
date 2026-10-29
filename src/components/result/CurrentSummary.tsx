import { won } from "@/lib/format";
import type { Evaluation } from "@/lib/types";
import styles from "./CurrentSummary.module.css";

/** F8: 지금 카드 대비 요약 (추천 결과 맨 위) */
export function CurrentSummary({ current, best }: { current: Evaluation; best: Evaluation }) {
  const gain = best.yearly - current.yearly;
  return (
    <section className={styles.summary}>
      <p className={styles.label}>
        지금 카드: {current.card.name} · 연간 순혜택 {won(current.yearly)}
        {current.shortOfMinSpend && " (실적 미달)"}
      </p>
      <p className={styles.value}>
        {gain > 0 ? `1위 카드로 바꾸면 연 ${won(gain)} 더` : "지금 카드가 가장 잘 맞아요. 바꾸지 않아도 돼요"}
      </p>
    </section>
  );
}
