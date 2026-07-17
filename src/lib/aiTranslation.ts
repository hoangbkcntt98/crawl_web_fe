import { pool } from "@/lib/db";
import { apiPath } from "@/lib/paths";

export const TRANSLATE_PROMPT =
  'Hãy đọc toàn bộ chữ trong ảnh này. Trích xuất các từ/cụm từ tiếng Nhật trong ảnh, sau đó dịch sang tiếng Việt. Chỉ trả về JSON hợp lệ, không Markdown, không giải thích ngoài JSON. Format bắt buộc: {"items":[{"text":"từ/cụm từ trong ảnh","reading":"cách đọc nếu biết, nếu không thì null","meaning_vi":"nghĩa tiếng Việt","confidence":0.0}],"note":"ghi chú nếu ảnh mờ/không đọc được, nếu không thì null"}';

export type ApiResponse = {
  kind: "chat" | "translation";
  content: unknown;
};

export type ImageRecord = {
  id: string;
  src: string;
  local_path: string | null;
  chapter_id: string;
  manga_title_id: string;
  store_images_locally: boolean;
};

type OpenClawResponse = {
  choices?: Array<{
    message?: { content?: string };
    text?: string;
  }>;
  error?: { message?: string };
};

function extractJsonSlice(text: string) {
  const start = text.search(/[\[{]/);
  if (start < 0) return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char);
      continue;
    }

    if (char !== "}" && char !== "]") continue;

    const expected = char === "}" ? "{" : "[";
    if (stack.pop() !== expected) return null;
    if (stack.length === 0) return text.slice(start, index + 1);
  }

  return null;
}

export function parseLooseJson<T = unknown>(text: string): T {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const jsonSlice = extractJsonSlice(trimmed);
    if (!jsonSlice) throw new Error("JSON response is invalid.");
    return JSON.parse(jsonSlice) as T;
  }
}

export async function getAiImage(imageId: string) {
  const imageResult = await pool.query<ImageRecord>(
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
     WHERE i.id = $1
       AND (s.store_images_locally = FALSE OR i.local_path IS NOT NULL)`,
    [imageId]
  );

  return imageResult.rows[0] ?? null;
}

export async function getCachedImageTranslation(imageId: string) {
  const cachedResult = await pool.query<{ response: ApiResponse }>(
    `SELECT response
     FROM manga_ai_responses
     WHERE image_id = $1 AND action = 'translate'
     LIMIT 1`,
    [imageId]
  );

  return cachedResult.rows[0]?.response ?? null;
}

export async function requestOpenClaw({
  image,
  message,
  requestUrl,
  translate,
}: {
  image: ImageRecord;
  message?: string;
  requestUrl: string;
  translate: boolean;
}) {
  const apiKey = process.env.OPENCLAW_API_KEY;
  const baseUrl = (
    process.env.OPENCLAW_BASE_URL || "http://openclaw:20128"
  ).replace(/\/+$/, "");
  const model = process.env.OPENCLAW_MODEL || "openclaw";

  if (!apiKey) {
    throw new Error("AIサービスが設定されていません。");
  }

  const text = translate
    ? TRANSLATE_PROMPT
    : `Hãy trả lời bằng tiếng Việt: ${message?.trim() ?? ""}`;

  const payload = {
    model,
    ...(translate ? { response_format: { type: "json_object" } } : {}),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text },
          {
            type: "image_url",
            image_url: {
              url:
                image.store_images_locally && image.local_path
                  ? new URL(apiPath(`/api/images/${image.id}`), requestUrl).toString()
                  : image.src,
            },
          },
        ],
      },
    ],
    max_tokens: translate ? 1000 : 100,
    temperature: translate ? 0 : 0.3,
  };

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
  const responseText = await response.text();
  const result = parseLooseJson<OpenClawResponse>(responseText);
  const content =
    result.choices?.[0]?.message?.content ??
    result.choices?.[0]?.text ??
    result.error?.message;

  if (!response.ok || !content) {
    throw new Error(content || "AIサービスから応答がありませんでした。");
  }

  return { content, model };
}

export async function requestOpenClawText({
  maxTokens = 800,
  message,
  responseFormatJson = false,
  temperature = 0.2,
}: {
  maxTokens?: number;
  message: string;
  responseFormatJson?: boolean;
  temperature?: number;
}) {
  const apiKey = process.env.OPENCLAW_API_KEY;
  const baseUrl = (
    process.env.OPENCLAW_BASE_URL || "http://openclaw:20128"
  ).replace(/\/+$/, "");
  const model = process.env.OPENCLAW_MODEL || "openclaw";

  if (!apiKey) {
    throw new Error("AIサービスが設定されていません。");
  }

  const payload = {
    model,
    ...(responseFormatJson ? { response_format: { type: "json_object" } } : {}),
    messages: [
      {
        role: "user",
        content: message,
      },
    ],
    max_tokens: maxTokens,
    temperature,
  };

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
  const responseText = await response.text();
  const result = parseLooseJson<OpenClawResponse>(responseText);
  const content =
    result.choices?.[0]?.message?.content ??
    result.choices?.[0]?.text ??
    result.error?.message;

  if (!response.ok || !content) {
    throw new Error(content || "AIサービスから応答がありませんでした。");
  }

  return { content, model };
}

export async function saveAiResponse({
  action,
  image,
  model,
  prompt,
  response,
}: {
  action: "chat" | "translate";
  image: ImageRecord;
  model: string;
  prompt: string;
  response: ApiResponse;
}) {
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
      action,
      prompt,
      JSON.stringify(response),
      model,
    ]
  );
}

export async function translateImageWithAi({
  image,
  requestUrl,
}: {
  image: ImageRecord;
  requestUrl: string;
}) {
  const { content, model } = await requestOpenClaw({
    image,
    requestUrl,
    translate: true,
  });

  let apiResponse: ApiResponse;
  try {
    apiResponse = {
      kind: "translation",
      content: parseLooseJson(content),
    };
  } catch {
    apiResponse = { kind: "chat", content };
  }

  await saveAiResponse({
    action: "translate",
    image,
    model,
    prompt: TRANSLATE_PROMPT,
    response: apiResponse,
  });

  return apiResponse;
}
