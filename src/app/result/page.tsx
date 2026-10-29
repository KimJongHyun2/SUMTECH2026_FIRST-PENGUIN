import { ResultView } from "@/components/result/ResultView";
import { cards } from "@/lib/cards";

export default function ResultPage() {
  return (
    <main className="container page">
      <h1 className="pageTitle">추천 결과</h1>
      <p className="pageLead">연간 순혜택(예상 월 혜택 × 12 − 연회비)이 큰 순서예요.</p>
      <ResultView cards={cards} />
    </main>
  );
}
