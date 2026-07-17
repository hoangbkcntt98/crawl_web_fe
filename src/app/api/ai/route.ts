import { NextResponse } from "next/server";
import {
  getAiImage,
  getCachedImageTranslation,
  requestOpenClaw,
  saveAiResponse,
  translateImageWithAi,
  type ApiResponse,
} from "@/lib/aiTranslation";

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

  const image = await getAiImage(body.imageId);
  if (!image) {
    return NextResponse.json(
      { error: "この画像は見つかりませんでした。" },
      { status: 404 }
    );
  }

  if (body.action === "translate") {
    const cached = await getCachedImageTranslation(image.id);
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }
  }

  try {
    let apiResponse: ApiResponse;
    if (body.action === "translate") {
      apiResponse = await translateImageWithAi({
        image,
        requestUrl: request.url,
      });
    } else {
      const { content, model } = await requestOpenClaw({
        image,
        message: body.message,
        requestUrl: request.url,
        translate: false,
      });
      apiResponse = { kind: "chat", content };
      await saveAiResponse({
        action: "chat",
        image,
        model,
        prompt: body.message.trim(),
        response: apiResponse,
      });
    }

    return NextResponse.json({ ...apiResponse, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AIサービスに接続できませんでした。";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
