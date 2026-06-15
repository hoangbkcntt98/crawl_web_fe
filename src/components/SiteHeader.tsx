import Link from "next/link";
import styles from "./SiteHeader.module.css";

export default function SiteHeader() {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link className={styles.logo} href="/">
          Manga<span>Rw</span>
        </Link>

        <nav className={styles.nav}>
          <Link href="/">漫画リスト</Link>
          <Link href="#">ジャンル</Link>
          <Link href="/favorites">しおり</Link>
          <Link href="/history">読書履歴</Link>
        </nav>

        <div className={styles.search}>⌕　マンガの名前を入力...</div>

        <div className={styles.mobileActions} aria-hidden="true">
          <span>⌕</span>
          <span>☰</span>
        </div>
      </div>
    </header>
  );
}
