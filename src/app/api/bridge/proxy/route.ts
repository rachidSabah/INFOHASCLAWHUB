import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// Built-in bridge proxy - routes requests to provider APIs using stored tokens
// Supports OpenAI-compatible endpoints for DeepSeek, Qwen, Kimi, Z.AI/GLM

export async function POST(req: NextRequest) {
  let apiUrl = "";
  try {
    const body = await req.json();
    const { messages, model, apiKey, provider: requestedProvider } = body;
    if (!messages) return NextResponse.json({ error: "messages required" }, { status: 400 });

    let provider: any;

    if (apiKey && apiKey.length > 10) {
      // Direct validation support - use the provided token
      provider = {
        name: requestedProvider || "Validation Test",
        apiKey: apiKey,
        baseUrl: ""
      };
      
      // Auto-detect base URL if not provided
      const pLower = (requestedProvider || "").toLowerCase();
      if (pLower.includes("deepseek")) provider.baseUrl = "http://localhost:8000/v1";
      else if (pLower.includes("qwen")) provider.baseUrl = "http://localhost:8100/v1";
      else if (pLower.includes("kimi")) provider.baseUrl = "http://localhost:8200/v1";
      else if (pLower.includes("z-ai") || pLower.includes("glm")) provider.baseUrl = "http://localhost:8300/v1";
      else if (pLower.includes("gemini")) provider.baseUrl = "https://generativelanguage.googleapis.com/v1beta";
    } else {
      // Find configured provider from DB
      const providers = await db.provider.findMany({ where: { isActive: true } });
      
      if (requestedProvider) {
        provider = providers.find((p: any) => p.name?.toLowerCase().includes(requestedProvider.toLowerCase()));
      }
      
      if (!provider) {
        provider = providers.find((p: any) => p.apiKey && p.apiKey.length > 10);
      }
    }
    
    if (!provider?.apiKey) {
      return NextResponse.json({ error: "No provider configured. Go to WebBridge → paste token → Configure." }, { status: 401 });
    }

    const baseUrl = (provider.baseUrl || "http://localhost:8000/v1").replace(/\/$/, "");
    apiUrl = baseUrl.endsWith("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

    // Map model per provider
    const pKey = provider.name?.toLowerCase() || "";
    let cleanModel = model?.includes("/") ? model.split("/").pop() : "chat";
    
    if (pKey.includes("deepseek")) cleanModel = "deepseek-chat";
    else if (pKey.includes("kimi") || pKey.includes("moonshot")) cleanModel = "moonshot-v1-8k";
    else if (pKey.includes("qwen")) cleanModel = "qwen-plus";
    else if (pKey.includes("z.ai") || pKey.includes("glm")) cleanModel = "glm-4-flash";
    else if (pKey.includes("gemini")) {
      cleanModel = "gemini-2.0-flash";
      if (baseUrl.includes("googleapis.com")) {
        // Direct Gemini API handling
        apiUrl = `${baseUrl}/models/${cleanModel}:generateContent?key=${provider.apiKey}`;
        const geminiRes = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: messages[messages.length - 1].content }] }] }),
          signal: AbortSignal.timeout(60000),
        });
        if (!geminiRes.ok) {
          const errText = await geminiRes.text().catch(() => "");
          return NextResponse.json({ error: `${geminiRes.status}: ${errText.slice(0, 150)}` }, { status: geminiRes.status });
        }
        const gData = await geminiRes.json();
        return NextResponse.json({
          content: gData.candidates?.[0]?.content?.parts?.[0]?.text || "",
          model: cleanModel, provider: provider.name,
        });
      }
    }

    const res = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
      body: JSON.stringify({ model: cleanModel, messages, temperature: 0.7, max_tokens: 2048, stream: false }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return NextResponse.json({ error: `${res.status}: ${errText.slice(0, 150)}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({
      content: data.choices?.[0]?.message?.content || "",
      model: cleanModel, provider: provider.name,
    });
  } catch (e: any) {
    if (e.message.includes("fetch failed") || e.code === "ECONNREFUSED") {
      return NextResponse.json({ 
        error: `Bridge connection failed: ${apiUrl}. Ensure the local bridge service is running.` 
      }, { status: 502 });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET: list available models for a provider
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const providerName = searchParams.get("provider");
  try {
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
  } catch {
    return NextResponse.json({ models: [] });
  }
}
