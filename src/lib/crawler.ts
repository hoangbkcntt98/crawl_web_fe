import { closeSync, openSync } from "fs";
import { dirname } from "path";
import { spawn } from "child_process";
import { pool } from "@/lib/db";

const crawlerScript =
  process.env.CRAWLER_SCRIPT ||
  "/home/opc/manga-crawler/generic_manga_crawler.py";
const crawlerPython = process.env.CRAWLER_PYTHON || "python3";
const crawlerLog =
  process.env.CRAWLER_LOG || "/home/opc/manga-crawler/crawler.log";

export function spawnCrawler(args: string[]) {
  const logFd = openSync(crawlerLog, "a");
  try {
    const child = spawn(crawlerPython, [crawlerScript, ...args], {
      cwd: dirname(crawlerScript),
      detached: true,
      env: process.env,
      stdio: ["ignore", logFd, logFd],
    });

    child.once("spawn", () => child.unref());
    return child;
  } finally {
    closeSync(logFd);
  }
}

export function getCrawlerLogPath() {
  return crawlerLog;
}

type CrawlingSite = {
  site_key: string;
  crawler_pid: number | null;
};

function isProcessRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function reconcileStoppedCrawlers() {
  const result = await pool.query<CrawlingSite>(
    `SELECT site_key, crawler_pid
     FROM crawler_sites
     WHERE crawl_status = 'crawling'`
  );

  for (const site of result.rows) {
    if (site.crawler_pid && isProcessRunning(site.crawler_pid)) continue;

    await pool.query(
      `UPDATE crawler_sites
       SET crawl_status = 'failed',
           crawl_error = COALESCE(
             crawl_error,
             'Crawler process stopped unexpectedly'
           ),
           crawler_pid = NULL,
           crawl_started_at = NULL,
           updated_at = NOW()
       WHERE site_key = $1 AND crawl_status = 'crawling'`,
      [site.site_key]
    );
  }
}
