import { redirect } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import styles from "./page.module.css";

type FlashcardRow = {
  id: string;
  front: string;
  back: {
    grammar?: string | null;
    kanji?: Array<{
      kanji: string;
      meaning_vi: string;
      onyomi?: string | null;
      kunyomi?: string | null;
    }>;
    meaning_vi?: string;
    reading?: string | null;
  };
  source_context: string | null;
  updated_at: Date;
};

export const dynamic = "force-dynamic";

export default async function FlashcardsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const result = await pool.query<FlashcardRow>(
    `SELECT id::text, front, back, source_context, updated_at
     FROM app_flashcards
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [user.id]
  );

  return (
    <main className={styles.page}>
      <SiteHeader />
      <div className={styles.container}>
        <h1>Flash Cards</h1>
        {result.rows.length ? (
          <div className={styles.grid}>
            {result.rows.map((card) => (
              <article className={styles.card} key={card.id}>
                <h2>{card.front}</h2>
                {card.back.reading ? <p>読み方: {card.back.reading}</p> : null}
                {card.back.meaning_vi ? <p>意味: {card.back.meaning_vi}</p> : null}
                {card.back.kanji?.length ? (
                  <div>
                    <strong>漢字</strong>
                    <ul>
                      {card.back.kanji.map((item, index) => (
                        <li key={`${item.kanji}-${index}`}>
                          {item.kanji}: {item.meaning_vi}
                          {item.onyomi || item.kunyomi
                            ? ` (${[item.onyomi, item.kunyomi]
                                .filter(Boolean)
                                .join(" / ")})`
                            : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {card.back.grammar ? <p>文法: {card.back.grammar}</p> : null}
                {card.source_context ? (
                  <small>Context: {card.source_context}</small>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.empty}>Chưa có flash card.</div>
        )}
      </div>
    </main>
  );
}
