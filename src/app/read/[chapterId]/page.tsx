import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import ChapterSelect from "@/components/ChapterSelect";
import MangaAiReader from "@/components/MangaAiReader";
import ReadingHistoryTracker from "@/components/ReadingHistoryTracker";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { apiPath } from "@/lib/paths";
import styles from "./page.module.css";

type Chapter = {
  id: string;
  manga_title_id: string;
  name: string;
  title: string;
  store_images_locally: boolean;
};

type ChapterOption = {
  id: string;
  name: string;
  chapter_number: string | null;
};

type ChapterImage = {
  id: string;
  position: number;
  src: string;
  local_path: string | null;
};

export const dynamic = "force-dynamic";

export default async function ReaderPage({
  params,
}: {
  params: Promise<{ chapterId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { chapterId } = await params;
  if (!/^\d+$/.test(chapterId)) notFound();

  const chapterResult = await pool.query<Chapter>(
    `SELECT
       c.id,
       c.manga_title_id,
       c.name,
       m.title,
       s.store_images_locally
     FROM manga_chapters c
     JOIN manga_titles m ON m.id = c.manga_title_id
     JOIN crawler_sites s ON s.site_key = m.site_key
     WHERE c.id = $1`,
    [chapterId]
  );
  const chapter = chapterResult.rows[0];
  if (!chapter) notFound();

  const [optionsResult, imagesResult] = await Promise.all([
    pool.query<ChapterOption>(
      `SELECT c.id, c.name, c.chapter_number
       FROM manga_chapters c
       WHERE c.manga_title_id = $1
       ORDER BY c.chapter_number ASC NULLS LAST, c.id ASC`,
      [chapter.manga_title_id]
    ),
    pool.query<ChapterImage>(
      `SELECT id, position, src, local_path
       FROM chapter_images
       WHERE chapter_id = $1
         AND ($2::boolean = FALSE OR local_path IS NOT NULL)
       ORDER BY position`,
      [chapterId, chapter.store_images_locally]
    ),
  ]);

  const chapters = optionsResult.rows;
  const currentIndex = chapters.findIndex((item) => item.id === chapter.id);
  const previous = currentIndex > 0 ? chapters[currentIndex - 1] : null;
  const next =
    currentIndex >= 0 && currentIndex < chapters.length - 1
      ? chapters[currentIndex + 1]
      : null;
  const renderChapterNavigator = (className: string) => (
    <nav className={className}>
      <div className={styles.navInner}>
        <Link className={styles.homeButton} href="/">
          ◆
        </Link>
        {previous ? (
          <Link className={styles.arrowButton} href={`/read/${previous.id}`}>
            ‹
          </Link>
        ) : (
          <span className={`${styles.arrowButton} ${styles.inactive}`}>‹</span>
        )}
        <ChapterSelect
          chapters={chapters}
          className={styles.select}
          currentChapterId={chapter.id}
        />
        {next ? (
          <Link className={styles.arrowButton} href={`/read/${next.id}`}>
            ›
          </Link>
        ) : (
          <span className={`${styles.arrowButton} ${styles.inactive}`}>›</span>
        )}
        <Link
          className={styles.homeButton}
          href={`/manga/${chapter.manga_title_id}`}
        >
          ♧
        </Link>
      </div>
    </nav>
  );

  return (
    <main className={styles.page}>
      <ReadingHistoryTracker chapterId={chapter.id} />
      <header className={styles.readerHeader}>
        <div className={styles.headerInner}>
          <div className={styles.breadcrumbs}>
            <Link href="/">ホーム</Link>
            <span>›</span>
            <Link href={`/manga/${chapter.manga_title_id}`}>
              {chapter.title}
            </Link>
            <span>›</span>
            <strong>{chapter.name}</strong>
          </div>
          <h1>{chapter.title}</h1>
          <p>{chapter.name}</p>
        </div>
      </header>

      {renderChapterNavigator(styles.chapterNav)}

      <div className={styles.viewer}>
        <p>↓ スクロールして読む</p>
        {imagesResult.rows.length > 0 ? (
          <MangaAiReader
            images={imagesResult.rows.map((image, index) => ({
              id: image.id,
              src: chapter.store_images_locally
                ? apiPath(`/api/images/${image.id}`)
                : image.src,
              alt: `${chapter.title} ${chapter.name} page ${index + 1}`,
              eager: index < 2,
            }))}
          />
        ) : (
          <div className={styles.empty}>
            Chapter này chưa có ảnh. Hãy chạy crawler lại.
          </div>
        )}
        {renderChapterNavigator(styles.bottomChapterNav)}
      </div>
    </main>
  );
}
