import { pool } from "@/lib/db";
import {
  getCachedImageTranslation,
  translateImageWithAi,
  type ImageRecord,
} from "@/lib/aiTranslation";

type JobRow = {
  status: string;
  total_count: number;
  processed_count: number;
  translated_count: number;
  skipped_count: number;
  failed_count: number;
  error: string | null;
};

const runningJobs = new Set<string>();
const stoppedJobs = new Set<string>();
const BULK_TRANSLATE_DELAY_MS = Number(
  process.env.AI_BULK_TRANSLATE_DELAY_MS || 1000
);
const BULK_TRANSLATE_RETRY_COUNT = Number(
  process.env.AI_BULK_TRANSLATE_RETRY_COUNT || 2
);
const BULK_TRANSLATE_RETRY_DELAY_MS = Number(
  process.env.AI_BULK_TRANSLATE_RETRY_DELAY_MS || 15000
);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("rate limit") ||
    message.includes("too many request") ||
    message.includes("429") ||
    message.includes("fetch failed") ||
    message.includes("econnrefused") ||
    message.includes("econnreset") ||
    message.includes("etimedout")
  );
}

function getErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Bulk translate failed";
  const cause = error.cause as
    | {
        address?: string;
        code?: string;
        message?: string;
        port?: number;
      }
    | undefined;

  if (cause?.code) {
    const target =
      cause.address && cause.port ? ` ${cause.address}:${cause.port}` : "";
    return `${error.message}: ${cause.code}${target}`;
  }

  return error.message;
}

async function translateWithRetry(image: ImageRecord, requestUrl: string) {
  let attempt = 0;
  while (true) {
    try {
      return await translateImageWithAi({ image, requestUrl });
    } catch (error) {
      attempt += 1;
      if (!isRateLimitError(error) || attempt > BULK_TRANSLATE_RETRY_COUNT) {
        throw error;
      }
      await sleep(BULK_TRANSLATE_RETRY_DELAY_MS * attempt);
    }
  }
}

async function ensureJobTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS manga_ai_bulk_jobs (
      manga_title_id BIGINT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'idle',
      total_count INTEGER NOT NULL DEFAULT 0,
      processed_count INTEGER NOT NULL DEFAULT 0,
      translated_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getImageCounts(titleId: string) {
  const result = await pool.query<{
    total_count: number;
    translated_count: number;
  }>(
    `SELECT
       COUNT(DISTINCT i.id)::int AS total_count,
       COUNT(DISTINCT r.image_id)::int AS translated_count
     FROM manga_titles m
     JOIN crawler_sites s ON s.site_key = m.site_key
     LEFT JOIN manga_chapters c ON c.manga_title_id = m.id
     LEFT JOIN chapter_images i ON i.chapter_id = c.id
       AND (s.store_images_locally = FALSE OR i.local_path IS NOT NULL)
     LEFT JOIN manga_ai_responses r ON r.image_id = i.id
       AND r.action = 'translate'
     WHERE m.id = $1`,
    [titleId]
  );

  return result.rows[0] ?? { total_count: 0, translated_count: 0 };
}

async function getJob(titleId: string) {
  await ensureJobTable();
  const result = await pool.query<JobRow>(
    `SELECT
       status,
       total_count,
       processed_count,
       translated_count,
       skipped_count,
       failed_count,
       error
     FROM manga_ai_bulk_jobs
     WHERE manga_title_id = $1`,
    [titleId]
  );
  const job = result.rows[0];
  const counts = await getImageCounts(titleId);
  if (job) {
    if (job.status === "running" && !runningJobs.has(titleId)) {
      const error = "Bulk translate was interrupted. Please start again.";
      await pool.query(
        `UPDATE manga_ai_bulk_jobs
         SET status = 'stopped',
             total_count = $2,
             processed_count = $3,
             translated_count = $3,
             error = $4,
             finished_at = NOW(),
             updated_at = NOW()
         WHERE manga_title_id = $1`,
        [titleId, counts.total_count, counts.translated_count, error]
      );

      return {
        ...job,
        status: "stopped",
        total_count: counts.total_count,
        processed_count: counts.translated_count,
        translated_count: counts.translated_count,
        error,
      };
    }

    return {
      ...job,
      total_count: counts.total_count,
      processed_count:
        job.status === "running" ? counts.translated_count : job.processed_count,
      translated_count: counts.translated_count,
    };
  }

  return {
    status: "idle",
    total_count: counts.total_count,
    processed_count: counts.translated_count,
    translated_count: counts.translated_count,
    skipped_count: 0,
    failed_count: 0,
    error: null,
  };
}

async function getImagesToTranslate(titleId: string) {
  const result = await pool.query<ImageRecord>(
    `SELECT
       i.id,
       i.src,
       i.local_path,
       i.chapter_id,
       c.manga_title_id,
       s.store_images_locally
     FROM chapter_images i
     JOIN manga_chapters c ON c.id = i.chapter_id
     JOIN manga_titles m ON m.id = c.manga_title_id
     JOIN crawler_sites s ON s.site_key = m.site_key
     LEFT JOIN manga_ai_responses r ON r.image_id = i.id
       AND r.action = 'translate'
     WHERE c.manga_title_id = $1
       AND (s.store_images_locally = FALSE OR i.local_path IS NOT NULL)
       AND r.id IS NULL
     ORDER BY c.chapter_number ASC NULLS LAST, c.id ASC, i.position ASC`,
    [titleId]
  );

  return result.rows;
}

async function runBulkTranslate(titleId: string, requestUrl: string) {
  if (runningJobs.has(titleId)) return;
  runningJobs.add(titleId);
  stoppedJobs.delete(titleId);

  try {
    const images = await getImagesToTranslate(titleId);
    const counts = await getImageCounts(titleId);
    await pool.query(
      `INSERT INTO manga_ai_bulk_jobs (
         manga_title_id,
         status,
         total_count,
         processed_count,
         translated_count,
         skipped_count,
         failed_count,
         error,
         started_at,
         finished_at,
         updated_at
       )
       VALUES ($1, 'running', $2, 0, $3, 0, 0, NULL, NOW(), NULL, NOW())
       ON CONFLICT (manga_title_id) DO UPDATE SET
         status = 'running',
         total_count = EXCLUDED.total_count,
         processed_count = 0,
         translated_count = EXCLUDED.translated_count,
         skipped_count = 0,
         failed_count = 0,
         error = NULL,
         started_at = NOW(),
         finished_at = NULL,
         updated_at = NOW()`,
      [titleId, counts.total_count, counts.translated_count]
    );

    let processed = 0;
    let skipped = 0;
    let failed = 0;
    let translated = counts.translated_count;

    for (const image of images) {
      if (stoppedJobs.has(titleId)) {
        await pool.query(
          `UPDATE manga_ai_bulk_jobs
           SET status = 'stopped',
               total_count = $2,
               processed_count = $3,
               translated_count = $3,
               skipped_count = $4,
               failed_count = $5,
               error = 'Stopped by user',
               finished_at = NOW(),
               updated_at = NOW()
           WHERE manga_title_id = $1`,
          [titleId, counts.total_count, translated, skipped, failed]
        );
        return;
      }

      let errorMessage: string | null = null;
      try {
        const cached = await getCachedImageTranslation(image.id);
        if (cached) {
          skipped += 1;
          translated += 1;
        } else {
          await translateWithRetry(image, requestUrl);
          translated += 1;
        }
      } catch (error) {
        failed += 1;
        errorMessage = getErrorMessage(error);
        console.error(`Bulk translate failed for image ${image.id}`, error);
      } finally {
        processed += 1;
        await pool.query(
          `UPDATE manga_ai_bulk_jobs
           SET processed_count = $2,
               translated_count = $3,
               skipped_count = $4,
               failed_count = $5,
               error = COALESCE($6, error),
               updated_at = NOW()
           WHERE manga_title_id = $1`,
          [titleId, processed, translated, skipped, failed, errorMessage]
        );
      }

      if (BULK_TRANSLATE_DELAY_MS > 0 && processed < images.length) {
        await sleep(BULK_TRANSLATE_DELAY_MS);
      }
    }

    await pool.query(
      `UPDATE manga_ai_bulk_jobs
       SET status = 'completed',
           processed_count = $2,
           translated_count = $3,
           skipped_count = $4,
           failed_count = $5,
           finished_at = NOW(),
           updated_at = NOW()
       WHERE manga_title_id = $1`,
      [titleId, processed, translated, skipped, failed]
    );
  } catch (error) {
    await pool.query(
      `UPDATE manga_ai_bulk_jobs
       SET status = 'failed',
           error = $2,
           finished_at = NOW(),
           updated_at = NOW()
       WHERE manga_title_id = $1`,
      [
        titleId,
        getErrorMessage(error),
      ]
    );
  } finally {
    runningJobs.delete(titleId);
    stoppedJobs.delete(titleId);
  }
}

function responseFromJob(job: JobRow) {
  return Response.json({
    ok: true,
    status: job.status,
    totalCount: job.total_count,
    processedCount: job.processed_count,
    translatedCount: job.translated_count,
    skippedCount: job.skipped_count,
    failedCount: job.failed_count,
    error: job.error,
  });
}

export async function GET(
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

  return responseFromJob(await getJob(id));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return Response.json(
      { ok: false, message: "Invalid title ID" },
      { status: 400 }
    );
  }

  const titleResult = await pool.query("SELECT 1 FROM manga_titles WHERE id = $1", [
    id,
  ]);
  if (!titleResult.rowCount) {
    return Response.json(
      { ok: false, message: "Title not found" },
      { status: 404 }
    );
  }

  const currentJob = await getJob(id);
  if (currentJob.status === "running" && runningJobs.has(id)) {
    return responseFromJob(currentJob);
  }

  void runBulkTranslate(id, request.url);
  return responseFromJob(await getJob(id));
}

export async function DELETE(
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

  await ensureJobTable();
  stoppedJobs.add(id);
  const counts = await getImageCounts(id);
  await pool.query(
    `INSERT INTO manga_ai_bulk_jobs (
       manga_title_id,
       status,
       total_count,
       processed_count,
       translated_count,
       skipped_count,
       failed_count,
       error,
       started_at,
       finished_at,
       updated_at
     )
     VALUES ($1, 'stopped', $2, $3, $3, 0, 0, 'Stopped by user', NULL, NOW(), NOW())
     ON CONFLICT (manga_title_id) DO UPDATE SET
       status = 'stopped',
       total_count = EXCLUDED.total_count,
       processed_count = EXCLUDED.processed_count,
       translated_count = EXCLUDED.translated_count,
       error = 'Stopped by user',
       finished_at = NOW(),
       updated_at = NOW()`,
    [id, counts.total_count, counts.translated_count]
  );

  return responseFromJob(await getJob(id));
}
