import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// Built-in bridge proxy - routes requests to provider APIs using stored tokens
// Supports OpenAI-compatible endpoints for DeepSeek, Qwen, Kimi, Z.AI/GLM

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, model } = body;

    if (!messages) return NextResponse.json({ error: "messages required" }, { status: 400 });

    const modelLower = (model || "").toLowerCase();
    const providerHint = modelLower.includes("moonshot") || modelLower.includes("kimi") ? "kimi" :
                        modelLower.includes("qwen") ? "qwen" :
                        modelLower.includes("glm") || modelLower.includes("bigmodel") ? "z-ai" : "deepseek";

    // Route through Playwright session engine
    const { sessionEngine } = await import("@/lib/session-engine");
    
    // Try to launch/capture a session
    const session = await sessionEngine.launchProvider(providerHint);
    
    if (!session.token) {
      return NextResponse.json({
        error: `No active ${providerHint} session. Click "Launch & Capture" in WebBridge first.`,
        provider: providerHint,
      }, { status: 401 });
    }

    // Use the captured token to configure a provider
    const providers = await db.provider.findMany({ where: { isActive: true } });
    const provider = providers.find((p: any) => p.name?.toLowerCase().includes(providerHint)) ||
                    (providerHint === "deepseek" ? providers.find((p: any) => p.name?.toLowerCase().includes("deepseek")) : null);

    if (!provider?.baseUrl) {
      return NextResponse.json({ error: `Configure ${providerHint} provider first` }, { status: 400 });
    }

    const baseUrl = provider.baseUrl.replace(/\/$/, "");
    const apiUrl = baseUrl.endsWith("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

    // Map model per provider
    let cleanModel = model?.includes("/") ? model.split("/").pop() : "chat";
    if (providerHint === "deepseek") cleanModel = "deepseek-chat";
    else if (providerHint === "kimi") cleanModel = "moonshot-v1-8k";
    else if (providerHint === "qwen") cleanModel = "qwen-plus";
    else if (providerHint === "z-ai") cleanModel = "glm-4-flash";

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ model: cleanModel, messages, temperature: 0.7, max_tokens: 2048, stream: false }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json({ error: `${providerHint} API ${res.status}: ${errText.slice(0, 150)}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({
      content: data.choices?.[0]?.message?.content || "",
      model: cleanModel,
      provider: provider.name,
    });
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
