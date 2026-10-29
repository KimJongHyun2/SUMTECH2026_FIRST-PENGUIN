import type { CATEGORIES, STATUSES, CARD_TYPE_OPTIONS } from "./constants";

export type Category = (typeof CATEGORIES)[number];
export type Status = (typeof STATUSES)[number];
export type CardTypeOption = (typeof CARD_TYPE_OPTIONS)[number];
export type Target = "전체" | "대학생" | "군인";

export interface Benefit {
  category: Category;
  /** 할인율(%) */
  rate: number;
  /** 월 할인 한도(원) */
  cap: number;
}

export interface Card {
  id: string;
  name: string;
  issuer: string;
  type: "신용" | "체크";
  annualFee: number;
  target: Target;
  minAge: number;
  /** 전월실적 조건(원) */
  minSpend: number;
  benefits: Benefit[];
  sourceUrl: string | null;
  /** 정보 확인일 YYYY-MM-DD */
  checkedAt: string | null;
}

export type Spending = Record<Category, number>;

export interface FormState {
  status: Status | "";
  age: string;
  cardType: CardTypeOption;
  feeCap: string;
  spend: Spending;
  sentence: string;
  currentCardId: string | null;
  compareIds: string[];
}

export interface Evaluation {
  card: Card;
  monthly: number;
  yearly: number;
  parts: { category: Category; amount: number }[];
  shortOfMinSpend: boolean;
}
