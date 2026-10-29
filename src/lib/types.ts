import type { CATEGORIES, STATUSES, CARD_TYPE_OPTIONS } from "./constants";

export type Category = (typeof CATEGORIES)[number];
export type Status = (typeof STATUSES)[number];
export type CardTypeOption = (typeof CARD_TYPE_OPTIONS)[number];
export type Target = "전체" | "대학생" | "군인";

export interface Benefit {
  category: Category;
  /** 할인율(%) */
  rate: number;
  /** 그 혜택의 월 할인 한도(원). null = 한도 없음 */
  cap: number | null;
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
  /** 카드 전체 월 할인 한도(원). null = 없음 */
  totalCap: number | null;
  /** 원문을 7개 분야 모델로 옮기며 단순화한 내용 */
  note: string;
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
