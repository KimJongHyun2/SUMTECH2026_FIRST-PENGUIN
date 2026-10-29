"use client";

import Link from "next/link";
import { CardVisual } from "@/components/card/CardVisual";
import { ButtonLink } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { CATEGORIES } from "@/lib/constants";
import { won } from "@/lib/format";
import { evaluate } from "@/lib/recommend";
import type { Card, Evaluation } from "@/lib/types";
import { useForm } from "@/providers/FormProvider";
import styles from "./CompareTable.module.css";

/** F6: 담은 카드 2~3장 나란히 비교 */
export function CompareTable({ cards }: { cards: Card[] }) {
  const { form, ready } = useForm();
  if (!ready) return null;

  const rows = form.compareIds
    .map((id) => cards.find((c) => c.id === id))
    .filter((c): c is Card => c !== undefined)
    .map((c) => evaluate(c, form.spend));

  if (rows.length < 2) {
    return (
      <Panel title="비교할 카드를 2장 이상 담아 주세요">
        <ButtonLink href="/result">추천 결과로</ButtonLink>
      </Panel>
    );
  }

  const line = (label: string, value: (r: Evaluation) => React.ReactNode, highlight = false) => (
    <tr className={highlight ? styles.highlight : undefined}>
      <th scope="row">{label}</th>
      {rows.map((r) => (
        <td key={r.card.id}>{value(r)}</td>
      ))}
    </tr>
  );

  return (
    <>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">카드</th>
              {rows.map((r) => (
                <th key={r.card.id} scope="col">
                  <div className={styles.cardHead}>
                    <CardVisual card={r.card} />
                    <Link href={`/cards/${r.card.id}`}>{r.card.name}</Link>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {line("연회비", (r) => won(r.card.annualFee))}
            {line("전월실적", (r) => won(r.card.minSpend))}
            {line("예상 월 혜택", (r) => won(r.monthly))}
            {line("연간 순혜택", (r) => won(r.yearly), true)}
            {CATEGORIES.map((c) => (
              <tr key={c}>
                <th scope="row">{c}</th>
                {rows.map((r) => (
                  <td key={r.card.id}>{won(r.parts.find((p) => p.category === c)?.amount ?? 0)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ButtonLink href="/result" variant="ghost">
        추천 결과로
      </ButtonLink>
    </>
  );
}
