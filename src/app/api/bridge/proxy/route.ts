import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// Built-in bridge proxy - routes requests to provider APIs using stored tokens
// Supports OpenAI-compatible endpoints for DeepSeek, Qwen, Kimi, Z.AI/GLM

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, model, provider: providerName } = body;

    if (!messages || !model) {
      return NextResponse.json({ error: "messages and model required" }, { status: 400 });
    }

    // Find the provider by name or use the first active web bridge provider
    let provider: any = null;
    const providers = await db.provider.findMany({ where: { isActive: true } });
    
    if (providerName) {
      provider = providers.find((p: any) => 
        p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-") === providerName ||
        p.name.toLowerCase().includes(providerName.toLowerCase())
      );
    }
    
    // Fallback: try any DeepSeek/Qwen/Kimi/GLM provider
    if (!provider) {
      for (const name of ["deepseek", "qwen", "kimi", "glm", "z.ai", "moonshot"]) {
        provider = providers.find((p: any) => p.name?.toLowerCase().includes(name));
        if (provider) break;
      }
    }

    if (!provider?.apiKey) {
      return NextResponse.json({ 
        error: "No provider configured with API key. Go to WebBridge → Configure a provider first." 
      }, { status: 401 });
    }

    const baseUrl = (provider.baseUrl || "http://localhost:8000/v1").replace(/\/$/, "");
    const apiUrl = baseUrl.endsWith("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;
    const cleanModel = model.includes("/") ? model.split("/").pop() : model;

    console.log(`[Bridge Proxy] Routing to ${apiUrl} with model ${cleanModel}`);

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: cleanModel,
        messages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: false,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[Bridge Proxy] ${apiUrl} returned ${res.status}: ${errText.slice(0, 200)}`);
      return NextResponse.json({ 
        error: `API error ${res.status}: ${errText.slice(0, 100) || "Authentication failed"}` 
      }, { status: res.status });
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";

    return NextResponse.json({ 
      content,
      model: cleanModel,
      provider: provider.name,
      usage: data.usage,
    });
  } catch (e: any) {
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      return NextResponse.json({ error: "Request timed out — bridge may not be running" }, { status: 504 });
    }
    console.error("[Bridge Proxy Error]:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
