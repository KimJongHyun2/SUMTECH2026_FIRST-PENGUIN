import Link from "next/link";
import { notFound } from "next/navigation";
import { CardVisual } from "@/components/card/CardVisual";
import { Panel } from "@/components/ui/Panel";
import { cards, getCard } from "@/lib/cards";
import { capLabel, targetLabel, won } from "@/lib/format";
import styles from "./page.module.css";

export function generateStaticParams() {
  return cards.map((c) => ({ id: c.id }));
}

export const dynamicParams = false;

export default async function CardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = getCard(id);
  if (!card) notFound();

  return (
    <main className="container page">
      <Link href="/cards" className={styles.back}>
        ← 전체 카드
      </Link>

      <div className={styles.layout}>
        <aside className={styles.side}>
          <CardVisual card={card} size="lg" />
          <h1 className={styles.name}>{card.name}</h1>
          <p className="muted">
            {card.issuer} · {card.type}카드
          </p>
          <dl className={styles.facts}>
            <dt>전월실적</dt>
            <dd>{won(card.minSpend)}</dd>
            <dt>연회비</dt>
            <dd>{won(card.annualFee)}</dd>
            <dt>가입 대상</dt>
            <dd>{targetLabel(card.target)}</dd>
            <dt>최소 나이</dt>
            <dd>{card.minAge}세 이상</dd>
          </dl>
        </aside>

        <div>
          <Panel title="혜택">
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>분야</th>
                  <th>할인율</th>
                  <th>월 한도</th>
                </tr>
              </thead>
              <tbody>
                {card.benefits.map((b) => (
                  <tr key={b.category}>
                    <td>{b.category}</td>
                    <td>{b.rate}%</td>
                    <td>{capLabel(b.cap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={`muted ${styles.note}`}>카드 전체 월 할인 한도: {capLabel(card.totalCap)}</p>
          </Panel>

          <Panel title="계산에 반영한 방식">
            <p>{card.note}</p>
          </Panel>

          <Panel title="정보 출처">
            {card.sourceUrl && card.checkedAt ? (
              <p>
                <a href={card.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.source}>
                  출처
                </a>{" "}
                · {card.checkedAt} 기준
              </p>
            ) : (
              <p className="notice">샘플 카드예요. 출처와 확인일이 아직 없어요.</p>
            )}
            <p className={`muted ${styles.note}`}>
              단순화한 계산이에요: 전월실적 구간은 가장 낮은 구간만, 실적 제외 조건은 반영하지 않아요.
            </p>
          </Panel>
        </div>
      </div>
    </main>
  );
}
