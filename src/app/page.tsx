import { pool } from "@/lib/db";
import CrawlButton from "@/components/CrawlButton";
import HomeHeaderActions from "@/components/HomeHeaderActions";
import TitleCrawlButton from "@/components/TitleCrawlButton";
import Link from "next/link";
import styles from "./page.module.css";

type MangaTitle = {
  id: number;
  title: string;
  href: string;
  src: string | null;
  updated_at: string;
  chapter_count: number;
  crawled_chapter_count: number;
  images_crawled_at: string | null;
  crawl_status: string;
};

type HomeProps = {
  searchParams: Promise<{
    page?: string | string[];
    q?: string | string[];
  }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 24;
const MAX_VISIBLE_PAGES = 7;

function getPageNumber(page: string | string[] | undefined) {
  const rawPage = Array.isArray(page) ? page[0] : page;
  const parsedPage = Number(rawPage ?? 1);

  return Number.isFinite(parsedPage) && parsedPage > 0
    ? Math.floor(parsedPage)
    : 1;
}

export default async function Home({ searchParams }: HomeProps) {
  const { page, q } = await searchParams;
  const currentPage = getPageNumber(page);
  const rawQuery = Array.isArray(q) ? q[0] : q;
  const query = rawQuery?.trim() ?? "";
  const searchPattern = `%${query}%`;
  const countResult = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM manga_titles
     WHERE title ILIKE $1`,
    [searchPattern]
  );
  const totalItems = countResult.rows[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const offset = (safePage - 1) * PAGE_SIZE;

  const result = await pool.query<MangaTitle>(
    `
      SELECT
        m.id,
        m.title,
        m.href,
        m.src,
        m.updated_at,
        d.images_crawled_at,
        COALESCE(d.crawl_status, 'idle') AS crawl_status,
        COUNT(c.id)::int AS chapter_count,
        COUNT(c.id) FILTER (
          WHERE EXISTS (
            SELECT 1
            FROM chapter_images i
            WHERE i.chapter_id = c.id
          )
        )::int AS crawled_chapter_count
      FROM manga_titles m
      LEFT JOIN manga_details d ON d.manga_title_id = m.id
      LEFT JOIN manga_chapters c ON c.manga_title_id = m.id
      WHERE m.title ILIKE $1
      GROUP BY m.id, d.images_crawled_at, d.crawl_status
      ORDER BY chapter_count DESC, m.updated_at DESC
      LIMIT $2 OFFSET $3
    `,
    [searchPattern, PAGE_SIZE, offset]
  );

  const canGoPrevious = safePage > 1;
  const canGoNext = safePage < totalPages;

  const firstVisiblePage = Math.max(
    1,
    Math.min(
      safePage - Math.floor(MAX_VISIBLE_PAGES / 2),
      totalPages - MAX_VISIBLE_PAGES + 1
    )
  );
  const visiblePageCount = Math.min(MAX_VISIBLE_PAGES, totalPages);
  const pageNumbers = Array.from(
    { length: visiblePageCount },
    (_, index) => firstVisiblePage + index
  );

  const pageHref = (pageNumber: number) => {
    const params = new URLSearchParams();
    if (query) {
      params.set("q", query);
    }
    params.set("page", String(pageNumber));
    return `/?${params.toString()}`;
  };

  return (
    <main
      className={styles.page}
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(39, 55, 92, 0.34), transparent 42%), linear-gradient(180deg, #0b1020 0%, #090d18 100%)",
        color: "#e8edf7",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <header
        className={styles.header}
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          backdropFilter: "blur(14px)",
          background: "rgba(7, 10, 20, 0.82)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div
          className={styles.headerInner}
          style={{
            maxWidth: 1440,
            margin: "0 auto",
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            gap: 24,
            position: "relative",
          }}
        >
          <Link
            className={styles.logo}
            href="/"
            style={{
              textDecoration: "none",
              color: "#fff",
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: -0.6,
            }}
          >
            Manga<span style={{ color: "#5ea3ff" }}>Rw</span>
          </Link>

          <nav
            className={styles.desktopNav}
            style={{ display: "flex", gap: 22, flexWrap: "wrap", fontSize: 15 }}
          >
            <Link href="#" style={{ color: "#93b7ff", textDecoration: "none", fontWeight: 700 }}>
              漫画リスト
            </Link>
            <Link href="#" style={{ color: "#c5cbe0", textDecoration: "none" }}>
              ジャンル
            </Link>
            <Link href="/favorites" style={{ color: "#c5cbe0", textDecoration: "none" }}>
              しおり
            </Link>
            <Link href="/history" style={{ color: "#c5cbe0", textDecoration: "none" }}>
              読書履歴
            </Link>
          </nav>

          <HomeHeaderActions initialQuery={query} />
        </div>
      </header>

      <div
        className={styles.content}
        style={{ maxWidth: 1440, margin: "0 auto", padding: "20px 24px 40px" }}
      >
        <section className={styles.heading} style={{ marginBottom: 20 }}>
          <h1
            className={styles.title}
            style={{ fontSize: 28, margin: 0, fontWeight: 900, letterSpacing: -0.4 }}
          >
            漫画を閲覧 <span style={{ color: "#8ea1c9", fontWeight: 700 }}>{totalItems} タイトル</span>
          </h1>
          {query && (
            <p className={styles.searchSummary}>
              「{query}」の検索結果
              <Link href="/">クリア</Link>
            </p>
          )}
          <p className={styles.resultSummary} style={{ margin: "10px 0 0", color: "#8ea1c9" }}>
            Showing {result.rows.length} of {totalItems} items on page {safePage} of {totalPages}
          </p>
        </section>

        <section
          className={styles.filters}
          style={{
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(10, 15, 29, 0.9)",
            boxShadow: "0 20px 60px rgba(0, 0, 0, 0.35)",
            padding: 16,
            marginBottom: 22,
          }}
        >
          <div className={styles.desktopFilters}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <div style={pillStyle(true)}>最新更新</div>
              <div style={pillStyle(false)}>すべて</div>
              <div style={pillStyle(false)}>進行中</div>
              <div style={pillStyle(false)}>完了</div>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <div style={pillStyle(false)}>18+ コンテンツ</div>
              <div
                style={{
                  ...pillStyle(true),
                  background: "linear-gradient(180deg, #173a70 0%, #113262 100%)",
                  color: "#d8e8ff",
                }}
              >
                適用
              </div>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <CrawlButton />
          </div>

          <div className={styles.mobileFilters}>
            <button type="button" className={styles.sortButton}>
              <span>最新更新</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m8 10 4 4 4-4" />
              </svg>
            </button>
            <button type="button" className={styles.filterButton}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 4v16M17 4v16M4 8h6M14 16h6" />
                <circle cx="7" cy="8" r="2" />
                <circle cx="17" cy="16" r="2" />
              </svg>
              フィルター
            </button>
          </div>
        </section>

        <section
          className={styles.mangaGrid}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
            gap: 14,
          }}
        >
          {result.rows.map((item) => (
            <article
              className={styles.mangaLink}
              key={item.id}
              style={{
                display: "block",
                color: "inherit",
              }}
            >
              <div
                className={styles.mangaCard}
                style={{
                  borderRadius: 18,
                  overflow: "hidden",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "0 16px 40px rgba(0, 0, 0, 0.24)",
                  transition: "transform 160ms ease, border-color 160ms ease",
                }}
              >
                <Link className={styles.cardLink} href={`/manga/${item.id}`}>
                  <div className={styles.cover} style={{ position: "relative" }}>
                    {item.src ? (
                      <img
                        className={styles.coverImage}
                        src={item.src}
                        alt={item.title}
                        style={{
                          width: "100%",
                          aspectRatio: "3 / 4",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    ) : (
                      <div
                        className={styles.coverPlaceholder}
                        style={{
                          width: "100%",
                          aspectRatio: "3 / 4",
                          display: "grid",
                          placeItems: "center",
                          background: "linear-gradient(135deg, #1b2340 0%, #111827 100%)",
                          color: "#95a7cb",
                          fontSize: 12,
                        }}
                      >
                        No image
                      </div>
                    )}

                    <span
                      className={styles.status}
                      style={{
                        position: "absolute",
                        top: 10,
                        right: 10,
                        borderRadius: 999,
                        background: item.images_crawled_at
                          ? "linear-gradient(180deg, #24bf7a 0%, #1d9f66 100%)"
                          : "linear-gradient(180deg, #e9a23b 0%, #c77c14 100%)",
                        color: "white",
                        fontSize: 12,
                        fontWeight: 800,
                        padding: "5px 10px",
                        boxShadow: item.images_crawled_at
                          ? "0 8px 18px rgba(29, 159, 102, 0.25)"
                          : "0 8px 18px rgba(199, 124, 20, 0.25)",
                      }}
                    >
                      {item.images_crawled_at ? "Crawled" : "更新中"}
                    </span>
                  </div>

                  <div className={styles.cardBody} style={{ padding: 12 }}>
                    <h3
                      className={styles.mangaTitle}
                      style={{
                        margin: 0,
                        fontSize: 15,
                        lineHeight: 1.45,
                        fontWeight: 800,
                        color: "#f3f6fb",
                        minHeight: 44,
                      }}
                    >
                      {item.title}
                    </h3>

                    <p
                      className={styles.updatedAt}
                      style={{ margin: "8px 0 0", fontSize: 12, color: "#8ea1c9" }}
                    >
                      {new Date(item.updated_at).toLocaleDateString("ja-JP", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                    <p className={styles.chapterCount}>
                      {item.chapter_count} chapters
                    </p>
                  </div>
                </Link>

                <TitleCrawlButton
                  className={styles.titleCrawlAction}
                  initialChapterCount={item.chapter_count}
                  initialCrawledChapterCount={item.crawled_chapter_count}
                  initialStatus={item.crawl_status}
                  isDone={item.images_crawled_at !== null}
                  titleId={item.id}
                  titleHref={`/manga/${item.id}`}
                />
              </div>
            </article>
          ))}
        </section>

        <nav
          className={styles.pagination}
          aria-label="Pagination"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 24,
          }}
        >
          <Link
            href={pageHref(Math.max(1, safePage - 1))}
            aria-disabled={!canGoPrevious}
            style={paginationButtonStyle(!canGoPrevious)}
          >
            Previous
          </Link>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            {firstVisiblePage > 1 && (
              <>
                <Link href={pageHref(1)} style={paginationButtonStyle(false)}>
                  1
                </Link>
                {firstVisiblePage > 2 && <span style={paginationEllipsisStyle}>...</span>}
              </>
            )}

            {pageNumbers.map((pageNumber) => (
              <Link
                key={pageNumber}
                href={pageHref(pageNumber)}
                aria-current={pageNumber === safePage ? "page" : undefined}
                style={paginationButtonStyle(false, pageNumber === safePage)}
              >
                {pageNumber}
              </Link>
            ))}

            {firstVisiblePage + visiblePageCount - 1 < totalPages && (
              <>
                {firstVisiblePage + visiblePageCount < totalPages && (
                  <span style={paginationEllipsisStyle}>...</span>
                )}
                <Link href={pageHref(totalPages)} style={paginationButtonStyle(false)}>
                  {totalPages}
                </Link>
              </>
            )}
          </div>

          <Link
            href={pageHref(Math.min(totalPages, safePage + 1))}
            aria-disabled={!canGoNext}
            style={paginationButtonStyle(!canGoNext)}
          >
            Next
          </Link>
        </nav>
      </div>
    </main>
  );
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    borderRadius: 12,
    border: active ? "1px solid rgba(94, 163, 255, 0.35)" : "1px solid rgba(255,255,255,0.08)",
    background: active ? "rgba(36, 69, 134, 0.65)" : "rgba(255,255,255,0.03)",
    color: active ? "#dbe7ff" : "#d3d8e8",
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 700,
  };
}

function paginationButtonStyle(disabled: boolean, active = false): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: active ? "1px solid rgba(94,163,255,0.4)" : "1px solid rgba(255,255,255,0.12)",
    background: active ? "rgba(37, 64, 118, 0.8)" : "rgba(255,255,255,0.04)",
    color: "#eef3ff",
    textDecoration: "none",
    opacity: disabled ? 0.45 : 1,
    pointerEvents: disabled ? "none" : "auto",
    fontWeight: active ? 800 : 600,
    minWidth: 56,
    textAlign: "center",
  };
}

const paginationEllipsisStyle: React.CSSProperties = {
  minWidth: 32,
  display: "grid",
  placeItems: "center",
  color: "#8ea1c9",
};
