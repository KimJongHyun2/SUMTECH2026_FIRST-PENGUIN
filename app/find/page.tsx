import Link from "next/link";
import { FindForm } from "@/components/FindForm";
import ui from "@/components/ui.module.css";
import { cards } from "@/lib/cards";

export default function FindPage() {
  return (
    <main className={ui.page}>
      <Link href="/" className={ui.backLink}>
        ← 처음으로
      </Link>
      <h1>내 정보와 지출</h1>
      <FindForm cards={cards} />
    </main>
  );
}
