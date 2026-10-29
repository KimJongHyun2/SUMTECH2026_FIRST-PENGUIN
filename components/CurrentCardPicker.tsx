"use client";

import { useState } from "react";
import type { Card } from "@/lib/types";
import { useForm } from "./FormProvider";
import ui from "./ui.module.css";
import formStyles from "./FindForm.module.css";
import styles from "./CurrentCardPicker.module.css";

/** F8: 지금 쓰는 카드 검색·선택 */
export function CurrentCardPicker({ cards }: { cards: Card[] }) {
  const { form, update } = useForm();
  const [query, setQuery] = useState("");
  const current = form.currentCardId ? cards.find((c) => c.id === form.currentCardId) : undefined;

  if (current) {
    return (
      <div className={styles.selected}>
        <div>
          <strong>{current.name}</strong>
          <div className={ui.muted}>{current.issuer}</div>
        </div>
        <button type="button" className={ui.buttonSmall} onClick={() => update({ currentCardId: null })}>
          빼기
        </button>
      </div>
    );
  }

  const term = query.trim();
  const results = term ? cards.filter((c) => c.name.includes(term) || c.issuer.includes(term)) : [];

  return (
    <div>
      <label className={formStyles.field}>
        <span>지금 쓰는 카드</span>
        <input placeholder="카드 이름 일부" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {term && results.length === 0 && <p className={ui.muted}>찾는 카드가 없어요</p>}
      {results.length > 0 && (
        <ul className={styles.results}>
          {results.map((c) => (
            <li key={c.id}>
              <button type="button" className={styles.result} onClick={() => update({ currentCardId: c.id })}>
                <strong>{c.name}</strong> <span className={ui.muted}>{c.issuer}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
