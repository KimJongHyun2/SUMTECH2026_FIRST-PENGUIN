"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Header.module.css";

const NAV = [
  { href: "/find", label: "카드 추천", match: ["/find", "/result", "/compare"] },
  { href: "/cards", label: "전체 카드", match: ["/cards"] },
];

export function Header() {
  const pathname = usePathname();
  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link href="/" className={styles.logo} aria-label="FIRST-PENGUIN 홈">
          <span className={styles.logoMark} aria-hidden>
            ◆
          </span>
          FIRST-PENGUIN
        </Link>
        <nav className={styles.nav} aria-label="주요 메뉴">
          {NAV.map((item) => {
            const active = item.match.some((m) => pathname.startsWith(m));
            return (
              <Link key={item.href} href={item.href} className={active ? styles.active : styles.link}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
