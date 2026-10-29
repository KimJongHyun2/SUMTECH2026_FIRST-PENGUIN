"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { CATEGORIES } from "@/lib/constants";
import type { Category, Spending } from "@/lib/types";
import { useForm } from "@/providers/FormProvider";
import styles from "./FindForm.module.css";

const AI_FAIL = "자동 채우기에 실패했어요. 직접 입력해 주세요";

/** F2 지출 칸 + F3 문장으로 채우기 */
export function SpendingFields() {
  const { form, update } = useForm();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const setSpend = (category: Category, raw: string) => {
    update({ spend: { ...form.spend, [category]: Math.max(0, Number.parseInt(raw, 10) || 0) } });
  };

  const fillWithAi = async () => {
    if (!form.sentence.trim()) {
      setMessage("소비 내용을 적어 주세요");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/parse-spending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: form.sentence }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = (await res.json()) as { spending?: Spending };
      if (!res.ok || !data.spending) throw new Error();
      const filled = { ...form.spend };
      for (const c of CATEGORIES) if (data.spending[c] > 0) filled[c] = data.spending[c];
      update({ spend: filled });
    } catch {
      setMessage(AI_FAIL);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Panel title="한 달 지출" description="분야별로 직접 넣거나, 평소 소비를 문장으로 쓰면 AI가 채워 줘요">
      <div className={styles.sentenceRow}>
        <Field label="문장으로 입력">
          <TextInput
            placeholder="예: 배달음식에 한 달 20만 원, 지하철 6만 원 써요"
            value={form.sentence}
            onChange={(e) => update({ sentence: e.target.value })}
          />
        </Field>
        <Button variant="secondary" onClick={fillWithAi} disabled={loading}>
          {loading ? "분석 중…" : "AI로 채우기"}
        </Button>
      </div>
      {message && <p className="error">{message}</p>}

      <div className={styles.spendGrid}>
        {CATEGORIES.map((c) => (
          <Field key={c} label={c}>
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="0"
              value={form.spend[c] || ""}
              onChange={(e) => setSpend(c, e.target.value)}
            />
          </Field>
        ))}
      </div>
    </Panel>
  );
}
