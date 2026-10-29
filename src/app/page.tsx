import { CardVisual } from "@/components/card/CardVisual";
import { ButtonLink } from "@/components/ui/Button";
import { cards } from "@/lib/cards";
import styles from "./page.module.css";

const FEATURES = [
  { title: "금액으로 말해요", body: "\"식비 10% 할인\" 대신 내 지출이면 월 얼마, 연회비 빼고 1년에 얼마인지 계산해요." },
  { title: "지금 카드와 비교해요", body: "지금 쓰는 카드를 넣으면 1위 카드로 바꿨을 때 1년에 얼마 더 받는지 보여 줘요." },
  { title: "연동 없이 바로", body: "로그인·금융 계정 연동이 없어요. 입력한 정보는 서버에 저장하지 않아요." },
];

export default function HomePage() {
  const showcase = cards.slice(0, 3);
  return (
    <main>
      <section className={styles.hero}>
        <div className={`container ${styles.heroInner}`}>
          <div>
            <p className={styles.eyebrow}>카드 혜택 계산기</p>
            <h1 className={styles.title}>
              내 소비로 계산한
              <br />
              <span className={styles.accent}>진짜 카드 혜택</span>
            </h1>
            <p className={styles.lead}>
              신분과 한 달 지출을 넣으면 카드마다 <strong>내가 실제로 받을 혜택 금액</strong>을 계산해 맞는 카드를 추천해요.
            </p>
            <div className={styles.actions}>
              <ButtonLink href="/find">내 카드 찾기</ButtonLink>
              <ButtonLink href="/cards" variant="ghost">
                전체 카드 보기
              </ButtonLink>
            </div>
          </div>
          <div className={styles.showcase} aria-hidden>
            {showcase.map((c) => (
              <CardVisual key={c.id} card={c} size="lg" />
            ))}
          </div>
        </div>
      </section>

      <section className="container">
        <ul className={styles.features}>
          {FEATURES.map((f) => (
            <li key={f.title}>
              <h2>{f.title}</h2>
              <p>{f.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
