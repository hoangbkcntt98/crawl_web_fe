import { pool } from "@/lib/db";
import { spawnCrawler } from "@/lib/crawler";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return Response.json(
      { ok: false, message: "Invalid title ID" },
      { status: 400 }
    );
  }

  const titleResult = await pool.query<{ title: string; site_key: string }>(
    `SELECT title, site_key
     FROM manga_titles
     WHERE id = $1`,
    [id]
  );
  const title = titleResult.rows[0];
  if (!title) {
    return Response.json(
      { ok: false, message: "Title not found" },
      { status: 404 }
    );
  }

  try {
    const started = await pool.query(
      `INSERT INTO manga_details (
         manga_title_id,
         crawl_status,
         crawl_error
       )
       VALUES ($1, 'crawling', NULL)
       ON CONFLICT (manga_title_id) DO UPDATE SET
         crawl_status = 'crawling',
         crawl_error = NULL,
         updated_at = NOW()
       WHERE manga_details.crawl_status IS DISTINCT FROM 'crawling'
       RETURNING manga_title_id`,
      [id]
    );

    if (started.rowCount === 0) {
      return Response.json(
        {
          ok: true,
          message: `${title.title}: chapter crawl already running`,
          status: "crawling",
        },
        { status: 202 }
      );
    }

    const crawler = spawnCrawler([
      "--site-key",
      title.site_key,
      "--manga-id",
      id,
      "--skip-title-list",
    ]);
    crawler.once("error", (error) => {
      void pool.query(
        `UPDATE manga_details
         SET crawl_status = 'failed', crawl_error = $1, updated_at = NOW()
         WHERE manga_title_id = $2 AND crawl_status = 'crawling'`,
        [error.message, id]
      );
    });

    return Response.json(
      {
        ok: true,
        message: `${title.title}: chapter crawl started`,
        status: "crawling",
      },
      { status: 202 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not crawl chapters";
    return Response.json({ ok: false, message }, { status: 500 });
  }
}
