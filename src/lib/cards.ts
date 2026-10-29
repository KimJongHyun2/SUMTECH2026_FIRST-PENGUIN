// F1 카드 데이터. 읽기 전용이라 DB 없이 data/cards.json을 그대로 쓴다.
import cardsJson from "@data/cards.json";
import type { Card } from "./types";

export const cards = cardsJson as Card[];

export function getCard(id: string): Card | undefined {
  return cards.find((c) => c.id === id);
}
