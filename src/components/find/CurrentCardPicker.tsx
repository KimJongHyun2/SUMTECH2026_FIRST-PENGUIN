"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import type { Card } from "@/lib/types";
import { useForm } from "@/providers/FormProvider";
import styles from "./CurrentCardPicker.module.css";

/** F8: 지금 쓰는 카드 검색·선택 */
export function CurrentCardPicker({ cards }: { cards: Card[] }) {
  const { form, update } = useForm();
  const [query, setQuery] = useState("");
  const current = form.currentCardId ? cards.find((c) => c.id === form.currentCardId) : undefined;
  const term = query.trim();
  const results = term ? cards.filter((c) => c.name.includes(term) || c.issuer.includes(term)) : [];

  return (
    <Panel title="지금 쓰는 카드 (선택)" description="고르면 바꿨을 때 1년에 얼마 더 받는지 같이 보여 드려요">
      {current ? (
        <div className={styles.selected}>
          <div>
            <strong>{current.name}</strong>
            <div className="muted">{current.issuer}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => update({ currentCardId: null })}>
            빼기
          </Button>
        </div>
      ) : (
        <>
          <Field label="지금 쓰는 카드">
            <TextInput placeholder="카드 이름 일부" value={query} onChange={(e) => setQuery(e.target.value)} />
          </Field>
          {term && results.length === 0 && <p className="muted">찾는 카드가 없어요</p>}
          {results.length > 0 && (
            <ul className={styles.results}>
              {results.map((c) => (
                <li key={c.id}>
                  <button type="button" className={styles.result} onClick={() => update({ currentCardId: c.id })}>
                    <strong>{c.name}</strong> <span className="muted">{c.issuer}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}
