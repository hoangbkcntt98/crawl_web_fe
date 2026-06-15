"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./HomeHeaderActions.module.css";

export default function HomeHeaderActions({
  initialQuery,
}: {
  initialQuery: string;
}) {
  const [mobilePanel, setMobilePanel] = useState<"search" | "menu" | null>(null);

  function togglePanel(panel: "search" | "menu") {
    setMobilePanel((current) => (current === panel ? null : panel));
  }

  return (
    <div className={styles.actions}>
      <form action="/" className={styles.desktopSearch} method="get">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
        <input
          aria-label="Search manga"
          defaultValue={initialQuery}
          name="q"
          placeholder="マンガの名前を入力..."
          type="search"
        />
      </form>

      <div className={styles.desktopProfile} aria-hidden="true">
        ◔
      </div>

      <div className={styles.mobileActions}>
        <button
          aria-expanded={mobilePanel === "search"}
          aria-label="Search"
          className={styles.iconButton}
          onClick={() => togglePanel("search")}
          type="button"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
        </button>
        <button
          aria-expanded={mobilePanel === "menu"}
          aria-label="Open menu"
          className={styles.iconButton}
          onClick={() => togglePanel("menu")}
          type="button"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>

      {mobilePanel === "search" && (
        <form action="/" className={styles.mobileSearch} method="get">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" />
          </svg>
          <input
            autoFocus
            aria-label="Search manga"
            defaultValue={initialQuery}
            name="q"
            placeholder="マンガの名前を入力..."
            type="search"
          />
        </form>
      )}

      {mobilePanel === "menu" && (
        <nav className={styles.mobileMenu} aria-label="Mobile navigation">
          <Link href="/" onClick={() => setMobilePanel(null)}>
            漫画リスト
          </Link>
          <Link href="#" onClick={() => setMobilePanel(null)}>
            ジャンル
          </Link>
          <Link href="/favorites" onClick={() => setMobilePanel(null)}>
            しおり
          </Link>
          <Link href="/history" onClick={() => setMobilePanel(null)}>
            読書履歴
          </Link>
        </nav>
      )}
    </div>
  );
}
