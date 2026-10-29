"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { won } from "@/lib/format";
import { totalSpend, validateForm, type FormError } from "@/lib/recommend";
import type { Card } from "@/lib/types";
import { useForm } from "@/providers/FormProvider";
import { CurrentCardPicker } from "./CurrentCardPicker";
import { ProfileFields } from "./ProfileFields";
import { SpendingFields } from "./SpendingFields";
import styles from "./FindForm.module.css";

/** /find: 왼쪽 입력, 오른쪽 요약 + 추천 받기 */
export function FindForm({ cards }: { cards: Card[] }) {
  const router = useRouter();
  const { form, update } = useForm();
  const [error, setError] = useState<FormError | null>(null);
  const current = form.currentCardId ? cards.find((c) => c.id === form.currentCardId) : undefined;

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
    <form onSubmit={submit} noValidate className="twoColumn">
      <div>
        <ProfileFields />
        <SpendingFields />
        <CurrentCardPicker cards={cards} />
      </div>

      <aside className="sticky">
        <Panel title="입력 요약">
          <dl className={styles.summary}>
            <dt>신분</dt>
            <dd>{form.status || "-"}</dd>
            <dt>나이</dt>
            <dd>{form.age ? `${form.age}세` : "-"}</dd>
            <dt>카드 종류</dt>
            <dd>{form.cardType}</dd>
            <dt>한 달 지출 합계</dt>
            <dd className={styles.total}>{won(totalSpend(form.spend))}</dd>
            <dt>지금 카드</dt>
            <dd>{current?.name ?? "-"}</dd>
          </dl>
          {error && (
            <p className={`error ${styles.submitError}`} role="alert">
              {error}
            </p>
          )}
          <Button type="submit" block>
            추천 받기
          </Button>
        </Panel>
      </aside>
    </form>
  );
}
