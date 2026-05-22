import { NextRequest, NextResponse } from "next/server";
import { getOpenAICompatibleGateway } from "@/lib/openai-gateway";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { model, messages, temperature, max_tokens, stream } = body;
    if (!model || !messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: { message: "model and messages are required", type: "invalid_request_error" } },
        { status: 400 }
      );
    }
    const gateway = getOpenAICompatibleGateway();
    return await gateway.chatCompletion({ model, messages, temperature, max_tokens, stream });
  } catch (error: unknown) {
    console.error("[OpenAI/Chat] POST error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json(
      { error: { message: "Internal server error", type: "internal_error" } },
      { status: 500 }
    );
  }
}
