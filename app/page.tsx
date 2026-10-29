import Link from "next/link";
import ui from "@/components/ui.module.css";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <main className={ui.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>FIRST-PENGUIN</p>
        <h1 className={styles.title}>내 카드 찾기</h1>
        <p className={styles.lead}>
          신분과 한 달 지출을 넣으면 카드마다 <strong>내가 실제로 받을 혜택 금액</strong>을 계산해 맞는 카드를 추천해요.
        </p>
        <p className={styles.lead}>
          지금 쓰는 카드를 넣으면 <strong>바꾸면 1년에 얼마 더 받는지</strong>도 알려 드려요.
        </p>
      </section>

      <div className={styles.actions}>
        <Link href="/find" className={ui.button}>
          내 카드 찾기
        </Link>
        <Link href="/cards" className={ui.buttonSecondary}>
          전체 카드 보기
        </Link>
      </div>

      <ul className={styles.points}>
        <li>로그인·금융 연동 없이 바로 써요</li>
        <li>입력한 정보는 서버에 저장하지 않아요</li>
        <li>순위는 공개된 규칙으로 계산해 근거를 함께 보여 줘요</li>
      </ul>
    </main>
  );
}
