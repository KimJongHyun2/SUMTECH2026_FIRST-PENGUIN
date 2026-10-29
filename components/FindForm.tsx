"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CARD_TYPE_OPTIONS, CATEGORIES, STATUSES } from "@/lib/constants";
import { validateForm, type FormError } from "@/lib/recommend";
import type { Card, CardTypeOption, Category, Spending, Status } from "@/lib/types";
import { useForm } from "./FormProvider";
import { CurrentCardPicker } from "./CurrentCardPicker";
import ui from "./ui.module.css";
import styles from "./FindForm.module.css";

const AI_FAIL = "자동 채우기에 실패했어요. 직접 입력해 주세요";

export function FindForm({ cards }: { cards: Card[] }) {
  const router = useRouter();
  const { form, update } = useForm();
  const [error, setError] = useState<FormError | null>(null);
  const [aiState, setAiState] = useState<{ loading: boolean; message: string | null }>({ loading: false, message: null });

  const setSpend = (category: Category, raw: string) => {
    const value = Math.max(0, Number.parseInt(raw, 10) || 0);
    update({ spend: { ...form.spend, [category]: value } });
  };

  const fillWithAi = async () => {
    if (!form.sentence.trim()) {
      setAiState({ loading: false, message: "소비 내용을 적어 주세요" });
      return;
    }
    setAiState({ loading: true, message: null });
    try {
      const res = await fetch("/api/parse-spending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: form.sentence }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = (await res.json()) as { spending?: Spending; error?: string };
      if (!res.ok || !data.spending) throw new Error(data.error);
      const filled = { ...form.spend };
      for (const c of CATEGORIES) if (data.spending[c] > 0) filled[c] = data.spending[c];
      update({ spend: filled });
      setAiState({ loading: false, message: null });
    } catch {
      setAiState({ loading: false, message: AI_FAIL });
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateForm(form);
    setError(found);
    if (!found) {
      update({ compareIds: [] });
      router.push("/result");
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <section className={ui.panel}>
        <h2>내 정보</h2>
        <label className={styles.field}>
          <span>신분</span>
          <select value={form.status} onChange={(e) => update({ status: e.target.value as Status | "" })}>
            <option value="">선택</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>나이</span>
          <input type="number" inputMode="numeric" min={1} value={form.age} onChange={(e) => update({ age: e.target.value })} />
        </label>
        <label className={styles.field}>
          <span>카드 종류</span>
          <select value={form.cardType} onChange={(e) => update({ cardType: e.target.value as CardTypeOption })}>
            {CARD_TYPE_OPTIONS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>연회비 상한</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="비우면 제한 없음"
            value={form.feeCap}
            onChange={(e) => update({ feeCap: e.target.value.replace("-", "") })}
          />
        </label>
      </section>

      <section className={ui.panel}>
        <h2>한 달 지출</h2>
        <label className={styles.field}>
          <span>문장으로 입력</span>
          <input
            placeholder="예: 배달음식에 한 달 20만 원, 지하철 6만 원 써요"
            value={form.sentence}
            onChange={(e) => update({ sentence: e.target.value })}
          />
        </label>
        <button type="button" className={ui.buttonSecondary} onClick={fillWithAi} disabled={aiState.loading}>
          {aiState.loading ? "분석 중…" : "AI로 채우기"}
        </button>
        {aiState.message && <p className={ui.error}>{aiState.message}</p>}

        <div className={styles.spendGrid}>
          {CATEGORIES.map((c) => (
            <label key={c} className={styles.field}>
              <span>{c}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="0"
                value={form.spend[c] || ""}
                onChange={(e) => setSpend(c, e.target.value)}
              />
            </label>
          ))}
        </div>
      </section>

      <section className={ui.panel}>
        <h2>지금 쓰는 카드 (선택)</h2>
        <CurrentCardPicker cards={cards} />
      </section>

      {error && <p className={ui.error} role="alert">{error}</p>}
      <button type="submit" className={ui.button}>
        추천 받기
      </button>
    </form>
  );
}
