import { NextResponse } from "next/server";
import { getOpenAICompatibleGateway } from "@/lib/openai-gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const gateway = getOpenAICompatibleGateway();
    const models = await gateway.listModels();
    return NextResponse.json({ object: "list", data: models });
  } catch (error: unknown) {
    console.error("[OpenAI/Models] GET error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: { message: "Failed to list models", type: "internal_error" } }, { status: 500 });
  }
}
