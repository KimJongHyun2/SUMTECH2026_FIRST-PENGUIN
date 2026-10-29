import { CardRow } from "@/components/card/CardRow";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { signedWon, won } from "@/lib/format";
import type { Evaluation } from "@/lib/types";
import styles from "./ResultCard.module.css";

interface ResultCardProps {
  rank: number;
  result: Evaluation;
  /** F8: 지금 카드 계산 결과 (없으면 비교 줄을 그리지 않음) */
  current: Evaluation | null;
  inCompare: boolean;
  onToggleCompare: () => void;
}

/** F4 추천 카드 한 장 */
export function ResultCard({ rank, result, current, inCompare, onToggleCompare }: ResultCardProps) {
  const isCurrent = current?.card.id === result.card.id;
  return (
    <CardRow
      card={result.card}
      emphasized={rank === 1}
      testId="result-card"
      eyebrow={
        <span className={styles.eyebrow}>
          <Badge tone="primary">{rank}위</Badge>
          {isCurrent && <Badge tone="benefit">지금 쓰는 카드</Badge>}
          {result.shortOfMinSpend && <Badge tone="danger">실적 미달</Badge>}
        </span>
      }
      action={
        <Button variant={inCompare ? "primary" : "ghost"} size="sm" onClick={onToggleCompare}>
          {inCompare ? "담김" : "비교 담기"}
        </Button>
      }
    >
      <dl className={styles.numbers}>
        <div>
          <dt>예상 월 혜택</dt>
          <dd>{won(result.monthly)}</dd>
        </div>
        <div>
          <dt>연간 순혜택</dt>
          <dd className={styles.yearly}>{won(result.yearly)}</dd>
        </div>
        {current && (
          <div>
            <dt>지금 카드 대비</dt>
            <dd className={styles.diff}>지금보다 연 {isCurrent ? won(0) : signedWon(result.yearly - current.yearly)}</dd>
          </div>
        )}
      </dl>
      {result.parts.length > 0 && (
        <ul className={styles.parts} aria-label="분야별 혜택">
          {result.parts.map((p) => (
            <li key={p.category}>
              {p.category} 월 {won(p.amount)}
            </li>
          ))}
        </ul>
      )}
    </CardRow>
  );
}
