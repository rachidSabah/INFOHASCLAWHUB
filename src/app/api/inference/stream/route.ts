import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { speculativeStream, getProviderScoreboard, getLatencyStats } from "@/lib/inference";

export async function POST(req: NextRequest) {
  try {
    const { prompt, model } = await req.json();
    if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });

    const providers = await db.provider.findMany({ where: { isActive: true, apiKey: { not: "" } } });
    const activeProviders = providers.filter((p: any) => p.apiKey && p.apiKey.length > 10);

    if (activeProviders.length === 0) {
      return NextResponse.json({ error: "No active providers configured" }, { status: 400 });
    }

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const configs = activeProviders.map((p: any) => ({
            name: p.name, baseUrl: p.baseUrl || "https://api.openai.com/v1",
            apiKey: p.apiKey,
            model: model?.includes("/") ? model.split("/").pop() : "chat",
          }));

          const result = await speculativeStream(
            prompt || "Hello",
            configs,
            (token: string, provider: string) => {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: token, provider })}\n\n`));
            }
          );

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", content: result.content, provider: result.provider, latencyMs: result.latencyMs })}\n\n`));
        } catch (e: any) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", error: e.message })}\n\n`));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    providers: getProviderScoreboard(),
    latency: getLatencyStats(),
  });
}
