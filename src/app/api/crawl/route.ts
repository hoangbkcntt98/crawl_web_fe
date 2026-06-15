import { readFile } from "fs/promises";
import { spawn } from "child_process";

export async function GET() {
  const logPath = process.env.CRAWLER_LOG || "/home/opc/manga-crawler/crawler.log";

  try {
    const content = await readFile(logPath, "utf8");
    const lines = content.split("\n").slice(-80).join("\n");

    return Response.json({
      ok: true,
      log: lines,
    });
  } catch {
    return Response.json({
      ok: true,
      log: "No log yet",
    });
  }
}

export async function POST() {
  const script =
    process.env.CRAWLER_SCRIPT || "/home/opc/manga-crawler/run_crawler.sh";

  try {
    const child = spawn(script, [], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    return Response.json({
      ok: true,
      message: "Crawler started in background",
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Could not start crawler",
      },
      { status: 500 }
    );
  }
}
