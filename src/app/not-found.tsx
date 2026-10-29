import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="container page">
      <h1 className="pageTitle">페이지를 찾을 수 없어요</h1>
      <p className="pageLead">주소가 바뀌었거나 없는 카드예요.</p>
      <ButtonLink href="/">처음으로</ButtonLink>
    </main>
  );
}
