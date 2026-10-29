import { ResultView } from "@/components/ResultView";
import ui from "@/components/ui.module.css";
import { cards } from "@/lib/cards";

export default function ResultPage() {
  return (
    <main className={ui.page}>
      <h1>추천 결과</h1>
      <ResultView cards={cards} />
    </main>
  );
}
