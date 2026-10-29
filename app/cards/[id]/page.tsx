import Link from "next/link";
import { notFound } from "next/navigation";
import ui from "@/components/ui.module.css";
import { cards, getCard } from "@/lib/cards";
import { targetLabel, won } from "@/lib/format";
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
    <main className={ui.page}>
      <Link href="/cards" className={ui.backLink}>
        ← 전체 카드
      </Link>
      <h1>{card.name}</h1>
      <p className={ui.muted}>
        {card.issuer} · {card.type}카드
      </p>

      <section className={ui.panel}>
        <h2>혜택</h2>
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
                <td>{won(b.cap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={ui.panel}>
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
      </section>

      <section className={ui.panel}>
        {card.sourceUrl && card.checkedAt ? (
          <p>
            <a href={card.sourceUrl} target="_blank" rel="noopener noreferrer" className={styles.source}>
              출처
            </a>{" "}
            · {card.checkedAt} 기준
          </p>
        ) : (
          <p className={ui.notice}>샘플 카드예요. 출처와 확인일이 아직 없어요.</p>
        )}
        <p className={ui.muted}>단순화한 계산이에요: 전월실적 구간은 가장 낮은 구간만, 실적 제외 조건은 반영하지 않아요.</p>
      </section>
    </main>
  );
}
