import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className="container">
        <p>SUMTECH Hackathon 2026 · FIRST-PENGUIN</p>
        <p>
          카드 혜택은 카드사 공개 상품 페이지를 기준으로 단순화해 계산한 예상 금액이에요. 가입 전 카드사에서 최신 조건을 확인해 주세요.
        </p>
      </div>
    </footer>
  );
}
