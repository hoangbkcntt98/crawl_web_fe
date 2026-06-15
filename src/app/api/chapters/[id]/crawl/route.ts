import { execFile } from "child_process";
import { promisify } from "util";
import { pool } from "@/lib/db";

const execFileAsync = promisify(execFile);

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return Response.json(
      { ok: false, message: "Invalid chapter ID" },
      { status: 400 }
    );
  }

  const chapterResult = await pool.query<{ name: string }>(
    "SELECT name FROM manga_chapters WHERE id = $1",
    [id]
  );
  const chapter = chapterResult.rows[0];
  if (!chapter) {
    return Response.json(
      { ok: false, message: "Chapter not found" },
      { status: 404 }
    );
  }

  const script =
    process.env.CRAWLER_SCRIPT || "/home/opc/manga-crawler/run_crawler.sh";

  try {
    await execFileAsync(script, ["--chapter-id", id], {
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });

    const imageResult = await pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM chapter_images
       WHERE chapter_id = $1`,
      [id]
    );
    const total = imageResult.rows[0]?.total ?? 0;

    return Response.json({
      ok: true,
      message: `${chapter.name}: crawled ${total} images`,
      imageCount: total,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not crawl chapter";
    return Response.json({ ok: false, message }, { status: 500 });
  }
}
