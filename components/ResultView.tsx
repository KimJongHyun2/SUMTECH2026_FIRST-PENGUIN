"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MAX_COMPARE } from "@/lib/constants";
import { won, signedWon } from "@/lib/format";
import { evaluate, recommend, totalSpend } from "@/lib/recommend";
import type { Card, Evaluation } from "@/lib/types";
import { useForm } from "./FormProvider";
import ui from "./ui.module.css";
import styles from "./ResultView.module.css";

export function ResultView({ cards }: { cards: Card[] }) {
  const router = useRouter();
  const { form, ready, update } = useForm();
  const [compareError, setCompareError] = useState(false);

  if (!ready) return null;
  if (totalSpend(form.spend) <= 0) {
    return (
      <section className={ui.panel}>
        <p>먼저 내 정보를 입력해 주세요</p>
        <Link href="/find" className={ui.button}>
          입력하러 가기
        </Link>
      </section>
    );
  }

  const rows = recommend(cards, form);
  const currentCard = form.currentCardId ? cards.find((c) => c.id === form.currentCardId) : undefined;
  const current = currentCard ? evaluate(currentCard, form.spend) : null;

  const toggleCompare = (id: string) => {
    if (form.compareIds.includes(id)) {
      update({ compareIds: form.compareIds.filter((x) => x !== id) });
      setCompareError(false);
    } else if (form.compareIds.length >= MAX_COMPARE) {
      setCompareError(true);
    } else {
      update({ compareIds: [...form.compareIds, id] });
    }
  };

  return (
    <>
      {current && rows.length > 0 && <CurrentSummary current={current} best={rows[0]} />}

      {rows.length === 0 ? (
        <p className={ui.error}>조건에 맞는 카드가 없어요. 연회비 상한이나 카드 종류를 바꿔 보세요</p>
      ) : (
        <ol className={styles.list}>
          {rows.map((r, i) => (
            <li key={r.card.id} className={i === 0 ? styles.cardTop : styles.card} data-testid="result-card">
              <div className={styles.head}>
                <span className={styles.rank}>{i + 1}위</span>
                <div>
                  <Link href={`/cards/${r.card.id}`} className={styles.name}>
                    {r.card.name}
                  </Link>
                  <div className={ui.muted}>
                    {r.card.issuer} · {r.card.type}
                  </div>
                </div>
                {current?.card.id === r.card.id && <span className={ui.badge}>지금 쓰는 카드</span>}
              </div>

              <dl className={styles.numbers}>
                <div>
                  <dt>예상 월 혜택</dt>
                  <dd>{won(r.monthly)}</dd>
                </div>
                <div>
                  <dt>연간 순혜택</dt>
                  <dd className={styles.strong}>{won(r.yearly)}</dd>
                </div>
                <div>
                  <dt>연회비</dt>
                  <dd>{won(r.card.annualFee)}</dd>
                </div>
              </dl>

              {r.shortOfMinSpend ? (
                <span className={ui.badgeDanger}>실적 미달</span>
              ) : (
                <ul className={styles.parts}>
                  {r.parts.map((p) => (
                    <li key={p.category}>
                      {p.category} 월 {won(p.amount)}
                    </li>
                  ))}
                </ul>
              )}

              {current && (
                <p className={styles.diff}>
                  지금보다 연 <strong>{current.card.id === r.card.id ? won(0) : signedWon(r.yearly - current.yearly)}</strong>
                </p>
              )}

              <button type="button" className={ui.buttonSmall} onClick={() => toggleCompare(r.card.id)}>
                {form.compareIds.includes(r.card.id) ? "담김" : "비교 담기"}
              </button>
            </li>
          ))}
        </ol>
      )}

      {compareError && <p className={ui.error}>최대 3장까지 비교할 수 있어요</p>}

      <div className={`${ui.row} ${styles.footer}`}>
        <Link href="/find" className={ui.buttonSecondary}>
          다시 입력하기
        </Link>
        <button type="button" className={ui.button} disabled={form.compareIds.length < 2} onClick={() => router.push("/compare")}>
          비교하기 ({form.compareIds.length})
        </button>
      </div>
    </>
  );
}

/** F8: 지금 카드 대비 요약 */
function CurrentSummary({ current, best }: { current: Evaluation; best: Evaluation }) {
  const gain = best.yearly - current.yearly;
  return (
    <section className={styles.summary}>
      <p className={styles.summaryLabel}>
        지금 카드: {current.card.name} · 연간 순혜택 {won(current.yearly)}
        {current.shortOfMinSpend && " (실적 미달)"}
      </p>
      <p className={styles.summaryValue}>
        {gain > 0 ? `1위 카드로 바꾸면 연 ${won(gain)} 더` : "지금 카드가 가장 잘 맞아요. 바꾸지 않아도 돼요"}
      </p>
    </section>
  );
}
