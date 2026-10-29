"use client";

import { useState } from "react";
import Link from "next/link";
import { targetLabel, won } from "@/lib/format";
import type { Card } from "@/lib/types";
import ui from "./ui.module.css";
import formStyles from "./FindForm.module.css";
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
      <div className={ui.row}>
        <label className={formStyles.field}>
          <span>카드 종류</span>
          <select value={type} onChange={(e) => setType(e.target.value as TypeFilter)}>
            <option value="">전체</option>
            <option>신용</option>
            <option>체크</option>
          </select>
        </label>
        <label className={formStyles.field}>
          <span>가입 대상</span>
          <select value={target} onChange={(e) => setTarget(e.target.value as TargetFilter)}>
            <option value="">전체</option>
            <option>대학생</option>
            <option>군인</option>
          </select>
        </label>
      </div>

      <p className={ui.muted}>{shown.length}장</p>
      <ul className={styles.list}>
        {shown.map((c) => (
          <li key={c.id} className={styles.item} data-testid="card-item">
            <Link href={`/cards/${c.id}`} className={styles.name}>
              {c.name}
            </Link>
            <div className={ui.muted}>
              {c.issuer} · {c.type}
            </div>
            <div className={styles.meta}>
              <span>연회비 {won(c.annualFee)}</span>
              <span>가입 대상 {targetLabel(c.target)}</span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
