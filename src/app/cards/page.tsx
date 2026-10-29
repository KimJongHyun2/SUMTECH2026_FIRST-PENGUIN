import { CardList } from "@/components/card/CardList";
import { cards } from "@/lib/cards";

export default function CardsPage() {
  return (
    <main className="container page">
      <h1 className="pageTitle">전체 카드</h1>
      <p className="pageLead">카드사 공개 상품 페이지에서 모은 카드예요. 카드 이름을 누르면 혜택과 출처를 볼 수 있어요.</p>
      <CardList cards={cards} />
    </main>
  );
}
