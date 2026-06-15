import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

const TRANSLATE_PROMPT =
  'Hãy đọc toàn bộ chữ trong ảnh này. Trích xuất các từ/cụm từ tiếng Nhật trong ảnh, sau đó dịch sang tiếng Việt. Chỉ trả về JSON hợp lệ, không Markdown, không giải thích ngoài JSON. Format bắt buộc: {"items":[{"text":"từ/cụm từ trong ảnh","reading":"cách đọc nếu biết, nếu không thì null","meaning_vi":"nghĩa tiếng Việt","confidence":0.0}],"note":"ghi chú nếu ảnh mờ/không đọc được, nếu không thì null"}';

type AiRequest =
  | {
      action: "translate";
      imageId: string;
    }
  | {
      action: "chat";
      imageId: string;
      message: string;
    };

type ImageRecord = {
  id: string;
  src: string;
  local_path: string | null;
  chapter_id: string;
  manga_title_id: string;
};

type ApiResponse = {
  kind: "chat" | "translation";
  content: unknown;
};

type OpenClawResponse = {
  choices?: Array<{
    message?: { content?: string };
    text?: string;
  }>;
  error?: { message?: string };
};

export async function POST(request: Request) {
  let body: AiRequest;

  try {
    body = (await request.json()) as AiRequest;
  } catch {
    return NextResponse.json(
      { error: "リクエストの形式が正しくありません。" },
      { status: 400 }
    );
  }

  if (
    (body.action !== "translate" && body.action !== "chat") ||
    typeof body.imageId !== "string" ||
    !/^\d+$/.test(body.imageId)
  ) {
    return NextResponse.json(
      { error: "画像または操作が正しくありません。" },
      { status: 400 }
    );
  }

  if (
    body.action === "chat" &&
    (typeof body.message !== "string" ||
      !body.message.trim() ||
      body.message.length > 4000)
  ) {
    return NextResponse.json(
      { error: "メッセージを入力してください。" },
      { status: 400 }
    );
  }

  const imageResult = await pool.query<ImageRecord>(
    `SELECT
       i.id,
       i.src,
       i.local_path,
       i.chapter_id,
       c.manga_title_id
     FROM chapter_images i
     JOIN manga_chapters c ON c.id = i.chapter_id
     WHERE i.id = $1 AND i.local_path IS NOT NULL`,
    [body.imageId]
  );
  const image = imageResult.rows[0];
  if (!image) {
    return NextResponse.json(
      { error: "この画像は見つかりませんでした。" },
      { status: 404 }
    );
  }

  if (body.action === "translate") {
    const cachedResult = await pool.query<{ response: ApiResponse }>(
      `SELECT response
       FROM manga_ai_responses
       WHERE image_id = $1 AND action = 'translate'
       LIMIT 1`,
      [image.id]
    );
    const cached = cachedResult.rows[0]?.response;
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }
  }

  const apiKey = process.env.OPENCLAW_API_KEY;
  const baseUrl = (
    process.env.OPENCLAW_BASE_URL || "http://openclaw:20128"
  ).replace(/\/+$/, "");
  const model = process.env.OPENCLAW_MODEL || "openclaw";

  if (!apiKey) {
    return NextResponse.json(
      { error: "AIサービスが設定されていません。" },
      { status: 503 }
    );
  }

  const text =
    body.action === "translate"
      ? TRANSLATE_PROMPT
      : `Hãy trả lời bằng tiếng Việt: ${body.message.trim()}`;

  const payload = {
    model,
    ...(body.action === "translate"
      ? { response_format: { type: "json_object" } }
      : {}),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text },
          {
            type: "image_url",
            image_url: {
              url: image.local_path
                ? new URL(`/api/images/${image.id}`, request.url).toString()
                : image.src,
            },
          },
        ],
      },
    ],
    max_tokens: body.action === "translate" ? 1000 : 100,
    temperature: body.action === "translate" ? 0 : 0.3,
  };

  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
    const result = (await response.json()) as OpenClawResponse;
    const content =
      result.choices?.[0]?.message?.content ??
      result.choices?.[0]?.text ??
      result.error?.message;

    if (!response.ok || !content) {
      return NextResponse.json(
        { error: content || "AIサービスから応答がありませんでした。" },
        { status: 502 }
      );
    }

    let apiResponse: ApiResponse;
    if (body.action === "translate") {
      try {
        apiResponse = {
          kind: "translation",
          content: JSON.parse(content),
        };
      } catch {
        apiResponse = { kind: "chat", content };
      }
    } else {
      apiResponse = { kind: "chat", content };
    }

    await pool.query(
      `INSERT INTO manga_ai_responses (
         image_id,
         chapter_id,
         manga_title_id,
         action,
         prompt,
         response,
         model
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (image_id, action) WHERE action = 'translate'
       DO UPDATE SET
         chapter_id = EXCLUDED.chapter_id,
         manga_title_id = EXCLUDED.manga_title_id,
         prompt = EXCLUDED.prompt,
         response = EXCLUDED.response,
         model = EXCLUDED.model,
         updated_at = NOW()`,
      [
        image.id,
        image.chapter_id,
        image.manga_title_id,
        body.action,
        body.action === "chat" ? body.message.trim() : TRANSLATE_PROMPT,
        JSON.stringify(apiResponse),
        model,
      ]
    );

    return NextResponse.json({ ...apiResponse, cached: false });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "AIサービスがタイムアウトしました。"
        : "AIサービスに接続できませんでした。";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
