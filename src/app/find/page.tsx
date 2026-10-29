import { FindForm } from "@/components/find/FindForm";
import { cards } from "@/lib/cards";

export default function FindPage() {
  return (
    <main className="container page">
      <h1 className="pageTitle">내 정보와 지출</h1>
      <p className="pageLead">입력한 정보는 이 브라우저에만 남고 서버에 저장하지 않아요.</p>
      <FindForm cards={cards} />
    </main>
  );
}
