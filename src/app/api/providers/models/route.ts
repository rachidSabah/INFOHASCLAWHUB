import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Return all active providers
    const providers = await db.provider.findMany({
      where: { isActive: true },
      select: { id: true, name: true, baseUrl: true },
    });
    return NextResponse.json({ providers, total: providers.length });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    let { baseUrl, apiKey } = await req.json();
    baseUrl = baseUrl?.trim();
    apiKey = apiKey?.trim();

    if (!baseUrl || !apiKey) {
      return NextResponse.json({ error: "Base URL and API Key are required" }, { status: 400 });
    }

    const base = baseUrl.replace(/\/$/, "");

    // Detect Google Gemini API — uses ?key= query param instead of Authorization header
    const isGeminiApi = base.includes("generativelanguage.googleapis.com");

    if (isGeminiApi) {
      // Google Gemini API: GET /v1beta/models?key=API_KEY
      const geminiUrl = `${base}/models?key=${apiKey}`;

      const res = await fetch(geminiUrl, {
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const errText = await res.text();
        return NextResponse.json({ error: `Gemini API error: ${res.status} ${errText}` }, { status: res.status });
      }

      const data = await res.json();

      // Gemini API returns { models: [{ name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", ... }] }
      let models: Array<{ id: string; name: string; description: string }> = [];

      if (data.models && Array.isArray(data.models)) {
        models = data.models
          .filter((m: any) => {
            // Only include models that support generateContent (not embedding-only)
            const methods: string[] = m.supportedGenerationMethods || [];
            return methods.includes("generateContent");
          })
          .map((m: any) => {
            // Extract model ID from "models/gemini-2.5-pro" format
            const modelId = m.name?.replace("models/", "") || m.name || "";
            const displayName = m.displayName || modelId;
            const description = m.description || `Gemini model — ${m.inputTokenLimit || "?"} input tokens`;
            return { id: modelId, name: displayName, description };
          });
      }

      return NextResponse.json(models);
    }

    // Standard OpenAI-compatible /models endpoint
    const url = `${base}/models`;

    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Provider error: ${res.status} ${errText}` }, { status: res.status });
    }

    const data = await res.json();

    // Standard OpenAI response is { data: [{ id: "model-name", ... }] }
    let models: Array<{ id: string; name: string; description: string }> = [];
    if (data.data && Array.isArray(data.data)) {
      models = data.data.map((m: { id: string; owned_by?: string }) => ({
        id: m.id,
        name: m.id,
        description: m.owned_by || `Model from ${new URL(baseUrl).hostname}`
      }));
    } else if (Array.isArray(data)) {
      // Some providers return a flat array
      models = data.map((m: string | { id?: string; name?: string }) => ({
        id: typeof m === 'string' ? m : m.id || m.name || '',
        name: typeof m === 'string' ? m : m.name || m.id || '',
        description: `Model from ${new URL(baseUrl).hostname}`
      }));
    }

    return NextResponse.json(models);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
