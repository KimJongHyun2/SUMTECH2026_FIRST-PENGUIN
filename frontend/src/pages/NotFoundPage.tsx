import { Link } from "react-router-dom";
export function NotFoundPage() {
  return (
    <section className="py-24 text-center">
      <h1 className="text-3xl font-bold">페이지를 찾을 수 없어요</h1>
      <Link to="/" className="mt-8 inline-block text-muted underline">
        홈으로 돌아가기
      </Link>
    </section>
  );
}
