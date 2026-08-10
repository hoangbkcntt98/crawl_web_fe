import {
  getDefaultImageAiSelection,
  getImageAiModelOptions,
} from "@/lib/aiModels";

export async function GET() {
  return Response.json({
    defaultSelection: getDefaultImageAiSelection(),
    models: getImageAiModelOptions(),
  });
}
