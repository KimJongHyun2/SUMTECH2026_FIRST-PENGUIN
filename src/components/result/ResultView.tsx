"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { MAX_COMPARE } from "@/lib/constants";
import { won } from "@/lib/format";
import { evaluate, recommend, totalSpend } from "@/lib/recommend";
import type { Card } from "@/lib/types";
import { useForm } from "@/providers/FormProvider";
import { CurrentSummary } from "./CurrentSummary";
import { ResultCard } from "./ResultCard";
import styles from "./ResultView.module.css";

/** /result: 왼쪽 추천 3장, 오른쪽 내 입력·비교 담기 */
export function ResultView({ cards }: { cards: Card[] }) {
  const router = useRouter();
  const { form, ready, update } = useForm();
  const [compareError, setCompareError] = useState(false);

  if (!ready) return null;
  if (totalSpend(form.spend) <= 0) {
    return (
      <Panel title="먼저 내 정보를 입력해 주세요">
        <ButtonLink href="/find">입력하러 가기</ButtonLink>
      </Panel>
    );
  }

  const rows = recommend(cards, form);
  const currentCard = form.currentCardId ? cards.find((c) => c.id === form.currentCardId) : undefined;
  const current = currentCard ? evaluate(currentCard, form.spend) : null;
  const compareCards = form.compareIds.map((id) => cards.find((c) => c.id === id)).filter((c): c is Card => !!c);

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
    <div className="twoColumn">
      <div>
        {current && rows.length > 0 && <CurrentSummary current={current} best={rows[0]} />}
        {rows.length === 0 ? (
          <Panel>
            <p className="error">조건에 맞는 카드가 없어요. 연회비 상한이나 카드 종류를 바꿔 보세요</p>
          </Panel>
        ) : (
          <ol className={styles.list}>
            {rows.map((r, i) => (
              <li key={r.card.id}>
                <ResultCard
                  rank={i + 1}
                  result={r}
                  current={current}
                  inCompare={form.compareIds.includes(r.card.id)}
                  onToggleCompare={() => toggleCompare(r.card.id)}
                />
              </li>
            ))}
          </ol>
        )}
      </div>

      <aside className="sticky">
        <Panel title="내 입력">
          <dl className={styles.facts}>
            <dt>신분 · 나이</dt>
            <dd>
              {form.status} · {form.age}세
            </dd>
            <dt>카드 종류</dt>
            <dd>{form.cardType}</dd>
            <dt>연회비 상한</dt>
            <dd>{form.feeCap ? won(Number(form.feeCap)) : "제한 없음"}</dd>
            <dt>한 달 지출</dt>
            <dd>{won(totalSpend(form.spend))}</dd>
          </dl>
          <ButtonLink href="/find" variant="ghost" block>
            다시 입력하기
          </ButtonLink>
        </Panel>

        <Panel title="비교함" description={`최대 ${MAX_COMPARE}장까지 담을 수 있어요`}>
          {compareCards.length > 0 && (
            <ul className={styles.compareList}>
              {compareCards.map((c) => (
                <li key={c.id}>{c.name}</li>
              ))}
            </ul>
          )}
          {compareError && <p className="error">최대 3장까지 비교할 수 있어요</p>}
          <Button block disabled={form.compareIds.length < 2} onClick={() => router.push("/compare")}>
            비교하기 ({form.compareIds.length})
          </Button>
        </Panel>
      </aside>
    </div>
  );
}
