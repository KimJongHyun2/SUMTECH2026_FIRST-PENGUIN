"use client";

import { useState } from "react";
import { Field, Select } from "@/components/ui/Field";
import type { Card } from "@/lib/types";
import { CardRow } from "./CardRow";
import styles from "./CardList.module.css";

type TypeFilter = "" | "신용" | "체크";
type TargetFilter = "" | "대학생" | "군인";

/** F7: 전체 카드 목록 + 필터 */
export function CardList({ cards }: { cards: Card[] }) {
  const [type, setType] = useState<TypeFilter>("");
  const [target, setTarget] = useState<TargetFilter>("");
  const shown = cards.filter((c) => (!type || c.type === type) && (!target || c.target === target));

  return (
    <>
      <div className={styles.toolbar}>
        <p className={styles.count}>
          카드 <strong>{shown.length}</strong>장
        </p>
        <div className={styles.filters}>
          <Field label="카드 종류">
            <Select value={type} onChange={(e) => setType(e.target.value as TypeFilter)}>
              <option value="">전체</option>
              <option>신용</option>
              <option>체크</option>
            </Select>
          </Field>
          <Field label="가입 대상">
            <Select value={target} onChange={(e) => setTarget(e.target.value as TargetFilter)}>
              <option value="">전체</option>
              <option>대학생</option>
              <option>군인</option>
            </Select>
          </Field>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="muted">조건에 맞는 카드가 없어요</p>
      ) : (
        <ul className={styles.list}>
          {shown.map((c) => (
            <li key={c.id}>
              <CardRow card={c} testId="card-item" />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
