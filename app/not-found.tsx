import Link from "next/link";
import ui from "@/components/ui.module.css";

export default function NotFound() {
  return (
    <main className={ui.page}>
      <h1>페이지를 찾을 수 없어요</h1>
      <p className={ui.muted}>주소가 바뀌었거나 없는 카드예요.</p>
      <Link href="/" className={ui.button}>
        처음으로
      </Link>
    </main>
  );
}
