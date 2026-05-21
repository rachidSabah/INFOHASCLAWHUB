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
        deepseek: ["deepseek"], qwen: ["qwen"], glm: ["glm", "z.ai", "chatglm", "zhipu", "bigmodel"],
        kimi: ["kimi", "moonshot"], gemini: ["gemini"],
      };
      for (const [key, patterns] of Object.entries(hints)) {
        if (patterns.some(h => (modelLower || "").includes(h))) {
          provider = providers.find((p: any) => p.name?.toLowerCase().includes(key));
          if (provider) break;
        }
      }
    }
    if (!provider) provider = providers.find((p: any) => p.apiKey && p.apiKey.length > 10);
    if (!provider?.apiKey) {
      const modelHint = (model || "").toLowerCase();
      const providerName = modelHint.includes("moonshot") || modelHint.includes("kimi") ? "Kimi" : 
                          modelHint.includes("qwen") ? "Qwen" :
                          modelHint.includes("glm") || modelHint.includes("z.ai") ? "Z.AI/GLM" :
                          modelHint.includes("gemini") ? "Gemini" : "DeepSeek";
      return NextResponse.json({ 
        error: `${providerName} not configured. Go to WebBridge → ${providerName} tab → paste token → click Configure first.` 
      }, { status: 401 });
    }

    const baseUrl = (provider.baseUrl || "http://localhost:8000/v1").replace(/\/$/, "");
    const apiUrl = baseUrl.endsWith("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
    let cleanModel = model?.includes("/") ? model.split("/").pop() : model || "chat";

    // Dynamic model mapping per provider based on actual API compatibility
    const providerKey = provider.name.toLowerCase();
    if (providerKey.includes("deepseek")) {
      cleanModel = "deepseek-chat"; // DeepSeek API accepts this
    } else if (providerKey.includes("kimi") || providerKey.includes("moonshot")) {
      cleanModel = "moonshot-v1-8k"; // Kimi API accepts this
    } else if (providerKey.includes("qwen")) {
      cleanModel = "qwen-plus"; // Qwen API
    } else if (providerKey.includes("z.ai") || providerKey.includes("glm") || providerKey.includes("bigmodel")) {
      cleanModel = "glm-4-flash"; // Z.AI API accepts this
    } else if (providerKey.includes("gemini")) {
      cleanModel = "gemini-2.0-flash"; // Gemini API
    }

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
