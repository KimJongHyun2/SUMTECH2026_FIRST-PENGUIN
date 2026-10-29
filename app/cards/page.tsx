import Link from "next/link";
import { CardList } from "@/components/CardList";
import ui from "@/components/ui.module.css";
import { cards } from "@/lib/cards";

export default function CardsPage() {
  return (
    <main className={ui.page}>
      <Link href="/" className={ui.backLink}>
        ← 처음으로
      </Link>
      <h1>전체 카드</h1>
      <CardList cards={cards} />
    </main>
  );
}
