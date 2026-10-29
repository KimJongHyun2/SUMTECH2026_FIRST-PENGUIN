"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { CATEGORIES, FORM_STORAGE_KEY } from "@/lib/constants";
import type { FormState, Spending } from "@/lib/types";

const emptySpend = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Spending;

export const initialForm: FormState = {
  status: "",
  age: "",
  cardType: "상관없음",
  feeCap: "",
  spend: emptySpend,
  sentence: "",
  currentCardId: null,
  compareIds: [],
};

interface FormContextValue {
  form: FormState;
  /** sessionStorage에서 값을 읽어 온 뒤 true (그 전에는 빈 값으로 판단하지 않는다) */
  ready: boolean;
  update: (patch: Partial<FormState>) => void;
}

const FormContext = createContext<FormContextValue | null>(null);

export function FormProvider({ children }: { children: React.ReactNode }) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(FORM_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<FormState>;
        setForm({ ...initialForm, ...parsed, spend: { ...emptySpend, ...parsed.spend } });
      }
    } catch {
      // 저장소를 못 쓰면 빈 입력으로 시작한다
    }
    setReady(true);
  }, []);

  const update = useCallback((patch: Partial<FormState>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      try {
        sessionStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // 저장 실패는 무시 (화면 상태는 유지)
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ form, ready, update }), [form, ready, update]);
  return <FormContext.Provider value={value}>{children}</FormContext.Provider>;
}

export function useForm(): FormContextValue {
  const ctx = useContext(FormContext);
  if (!ctx) throw new Error("useForm은 FormProvider 안에서만 쓸 수 있어요");
  return ctx;
}
