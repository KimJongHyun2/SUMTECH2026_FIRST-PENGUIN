// F4·F8 계산. 순수 함수만 둔다(같은 입력이면 같은 결과).
import { TOP_N } from "./constants";
import type { Card, Evaluation, FormState, Spending } from "./types";

export function totalSpend(spend: Spending): number {
  return Object.values(spend).reduce((sum, v) => sum + v, 0);
}

export function evaluate(card: Card, spend: Spending): Evaluation {
  if (totalSpend(spend) < card.minSpend) {
    return { card, monthly: 0, yearly: -card.annualFee, parts: [], shortOfMinSpend: true };
  }
  const parts = card.benefits
    .map((b) => ({ category: b.category, amount: Math.min(Math.floor((spend[b.category] * b.rate) / 100), b.cap) }))
    .filter((p) => p.amount > 0);
  const monthly = parts.reduce((sum, p) => sum + p.amount, 0);
  return { card, monthly, yearly: monthly * 12 - card.annualFee, parts, shortOfMinSpend: false };
}

export function isEligible(card: Card, form: FormState): boolean {
  const age = Number.parseInt(form.age, 10);
  const feeCap = form.feeCap.trim() === "" ? Infinity : Number(form.feeCap);
  const wantType = form.cardType === "신용카드" ? "신용" : form.cardType === "체크카드" ? "체크" : null;
  return (
    (card.target === "전체" || card.target === form.status) &&
    age >= card.minAge &&
    (wantType === null || card.type === wantType) &&
    card.annualFee <= feeCap
  );
}

export function recommend(cards: Card[], form: FormState): Evaluation[] {
  return cards
    .filter((c) => isEligible(c, form))
    .map((c) => evaluate(c, form.spend))
    .sort(
      (a, b) =>
        b.yearly - a.yearly || a.card.annualFee - b.card.annualFee || a.card.name.localeCompare(b.card.name, "ko"),
    )
    .slice(0, TOP_N);
}

export type FormError = "신분을 골라 주세요" | "나이를 입력해 주세요" | "지출 금액을 하나 이상 입력해 주세요";

export function validateForm(form: FormState): FormError | null {
  if (!form.status) return "신분을 골라 주세요";
  if (!(Number.parseInt(form.age, 10) > 0)) return "나이를 입력해 주세요";
  if (totalSpend(form.spend) <= 0) return "지출 금액을 하나 이상 입력해 주세요";
  return null;
}
