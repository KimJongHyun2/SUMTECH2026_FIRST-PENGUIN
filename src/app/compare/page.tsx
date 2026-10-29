import { CompareTable } from "@/components/compare/CompareTable";
import { cards } from "@/lib/cards";

export default function ComparePage() {
  return (
    <main className="container page">
      <h1 className="pageTitle">카드 비교</h1>
      <p className="pageLead">입력한 지출 기준으로 계산한 금액이에요.</p>
      <CompareTable cards={cards} />
    </main>
  );
}
