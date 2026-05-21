import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// Built-in bridge proxy - routes requests to provider APIs using stored tokens
// Supports OpenAI-compatible endpoints for DeepSeek, Qwen, Kimi, Z.AI/GLM

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, model, provider: providerName, action } = body;

    // Find the provider
    let provider: any = null;
    const providers = await db.provider.findMany({ where: { isActive: true } });

    // Smart provider matching
    const modelLower = (model || "").toLowerCase();
    if (providerName) {
      provider = providers.find((p: any) => p.name?.toLowerCase().includes(providerName.toLowerCase()));
    }
    if (!provider) {
      const hints: Record<string, string[]> = {
        deepseek: ["deepseek"], qwen: ["qwen"], glm: ["glm", "z.ai", "chatglm", "zhipu"],
        kimi: ["kimi", "moonshot"], gemini: ["gemini"],
      };
      for (const [key, hints] of Object.entries(hints)) {
        if (hints.some(h => modelLower.includes(h))) {
          provider = providers.find((p: any) => p.name?.toLowerCase().includes(key));
          if (provider) break;
        }
      }
    }
    if (!provider) provider = providers.find((p: any) => p.apiKey && p.apiKey.length > 10);
    if (!provider?.apiKey) {
      return NextResponse.json({ error: "No provider configured. Go to WebBridge → Configure a provider first." }, { status: 401 });
    }

    const baseUrl = (provider.baseUrl || "http://localhost:8000/v1").replace(/\/$/, "");

    // If action is list_models, query the provider for available models
    if (action === "list_models") {
      try {
        const modelsRes = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${provider.apiKey}` },
          signal: AbortSignal.timeout(10000),
        });
        if (modelsRes.ok) {
          const data = await modelsRes.json();
          const models = (data.data || []).map((m: any) => ({
            id: m.id || m.name, name: m.id || m.name || "model"
          }));
          return NextResponse.json({ provider: provider.name, models });
        }
        // Try list endpoint
        const listRes = await fetch(`${baseUrl}/v1/models`, {
          headers: { Authorization: `Bearer ${provider.apiKey}` },
          signal: AbortSignal.timeout(10000),
        });
        if (listRes.ok) {
          const data = await listRes.json();
          const models = (data.data || []).map((m: any) => ({
            id: m.id || m.name, name: m.id || m.name || "model"
          }));
          return NextResponse.json({ provider: provider.name, models });
        }
      } catch {}
      // Fallback: return prebuilt models
      return NextResponse.json({ provider: provider.name, models: [], fallback: true });
    }

    if (!messages) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    // Chat completion
    const apiUrl = baseUrl.endsWith("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
    let cleanModel = model?.includes("/") ? model.split("/").pop() : model || "chat";
    
    console.log(`[Bridge] ${provider.name} → ${apiUrl}, model: ${cleanModel}`);

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify({ model: cleanModel, messages, temperature: 0.7, max_tokens: 4096, stream: false }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[Bridge] ${res.status}: ${errText.slice(0, 200)}`);
      return NextResponse.json({ error: `API error ${res.status}: ${errText.slice(0, 100)}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({ content: data.choices?.[0]?.message?.content || "", model: cleanModel, provider: provider.name, usage: data.usage });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET: list available models for a provider
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const providerName = searchParams.get("provider");
  const providers = await db.provider.findMany({ where: { isActive: true } });
  let provider = providerName ? providers.find((p: any) => p.name?.toLowerCase().includes(providerName.toLowerCase())) : providers.find((p: any) => p.apiKey && p.apiKey.length > 10);
  if (!provider) return NextResponse.json({ models: [] });
  
  const baseUrl = (provider.baseUrl || "").replace(/\/$/, "");
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json({ provider: provider.name, models: (data.data || []).map((m: any) => ({ id: m.id, name: m.id })) });
    }
  } catch {}
  return NextResponse.json({ provider: provider.name, models: [], fallback: true });
}
