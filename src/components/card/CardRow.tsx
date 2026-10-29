import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { targetLabel, won } from "@/lib/format";
import type { Card } from "@/lib/types";
import { CardVisual } from "./CardVisual";
import styles from "./CardRow.module.css";

interface CardRowProps {
  card: Card;
  /** 카드 이름 위 작은 머리말 (예 "1위") */
  eyebrow?: React.ReactNode;
  /** 이름 아래 강조 줄 (예 "월 예상 혜택 25,000원") */
  highlight?: React.ReactNode;
  /** 조건 배지 아래 추가 내용 */
  children?: React.ReactNode;
  /** 오른쪽 끝 버튼 영역 */
  action?: React.ReactNode;
  emphasized?: boolean;
  testId?: string;
}

/** 카드 한 장을 가로 한 줄로 보여 준다(목록·추천 결과 공용) */
export function CardRow({ card, eyebrow, highlight, children, action, emphasized, testId }: CardRowProps) {
  return (
    <article className={emphasized ? styles.rowEmphasized : styles.row} data-testid={testId}>
      <CardVisual card={card} />
      <div className={styles.body}>
        {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
        <Link href={`/cards/${card.id}`} className={styles.name}>
          {card.name}
        </Link>
        <div className={styles.issuer}>
          {card.issuer} · {card.type}
        </div>
        {highlight && <div className={styles.highlight}>{highlight}</div>}
        <div className={styles.badges}>
          <Badge>연회비 {won(card.annualFee)}</Badge>
          <Badge>전월실적 {card.minSpend > 0 ? `${won(card.minSpend)} 이상` : "없음"}</Badge>
          <Badge>가입 대상 {targetLabel(card.target)}</Badge>
        </div>
        {children}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </article>
  );
}
