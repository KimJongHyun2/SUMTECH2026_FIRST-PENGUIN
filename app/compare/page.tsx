import { CompareView } from "@/components/CompareView";
import ui from "@/components/ui.module.css";
import { cards } from "@/lib/cards";

export default function ComparePage() {
  return (
    <main className={ui.page}>
      <h1>카드 비교</h1>
      <CompareView cards={cards} />
    </main>
  );
}
