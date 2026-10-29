"use client";

import { Field, Select, TextInput } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { CARD_TYPE_OPTIONS, STATUSES } from "@/lib/constants";
import type { CardTypeOption, Status } from "@/lib/types";
import { useForm } from "@/providers/FormProvider";
import styles from "./FindForm.module.css";

/** F2: 신분·나이·카드 종류·연회비 상한 */
export function ProfileFields() {
  const { form, update } = useForm();
  return (
    <Panel title="내 정보" description="신분과 나이로 가입할 수 있는 카드만 남겨요">
      <div className={styles.grid2}>
        <Field label="신분">
          <Select value={form.status} onChange={(e) => update({ status: e.target.value as Status | "" })}>
            <option value="">선택</option>
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="나이">
          <TextInput type="number" inputMode="numeric" min={1} value={form.age} onChange={(e) => update({ age: e.target.value })} />
        </Field>
        <Field label="카드 종류">
          <Select value={form.cardType} onChange={(e) => update({ cardType: e.target.value as CardTypeOption })}>
            {CARD_TYPE_OPTIONS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="연회비 상한" hint="비우면 제한 없음">
          <TextInput
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="원"
            value={form.feeCap}
            onChange={(e) => update({ feeCap: e.target.value.replace("-", "") })}
          />
        </Field>
      </div>
    </Panel>
  );
}
