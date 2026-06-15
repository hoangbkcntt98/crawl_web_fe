import { createReadStream } from "fs";
import { realpath, stat } from "fs/promises";
import { sep } from "path";
import { Readable } from "stream";
import { pool } from "@/lib/db";
import { imageStorageRoot } from "@/lib/imageStorage";

type ImageRow = {
  local_path: string;
  content_type: string | null;
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return Response.json({ message: "Invalid image ID" }, { status: 400 });
  }

  const result = await pool.query<ImageRow>(
    `SELECT local_path, content_type
     FROM chapter_images
     WHERE id = $1 AND local_path IS NOT NULL`,
    [id]
  );
  const image = result.rows[0];
  if (!image) {
    return Response.json({ message: "Local image not found" }, { status: 404 });
  }

  try {
    const [rootPath, imagePath] = await Promise.all([
      realpath(imageStorageRoot),
      realpath(image.local_path),
    ]);
    if (!imagePath.startsWith(`${rootPath}${sep}`)) {
      return Response.json({ message: "Invalid image path" }, { status: 403 });
    }

    const file = await stat(imagePath);
    return new Response(
      Readable.toWeb(createReadStream(imagePath)) as ReadableStream<Uint8Array>,
      {
        headers: {
          "Cache-Control": "public, max-age=3600",
          "Content-Length": String(file.size),
          "Content-Type": image.content_type || "application/octet-stream",
        },
      }
    );
  } catch {
    return Response.json({ message: "Local image file missing" }, { status: 404 });
  }
}
