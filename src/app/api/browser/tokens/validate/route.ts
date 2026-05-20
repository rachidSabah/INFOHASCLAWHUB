import { NextRequest, NextResponse } from "next/server";

interface ValidateRequest {
  token: string;
  baseUrl: string;
  model?: string;
}

// Validate a token by making a test API call to the bridge/provider
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as ValidateRequest;
    const { token, baseUrl, model } = body;

    if (!token || !baseUrl) {
      return NextResponse.json({ valid: false, error: "Token and baseUrl are required" }, { status: 400 });
    }

    // Clean up token — strip "Bearer " prefix if present
    const cleanToken = token.replace(/^Bearer\s+/i, "").trim();
    if (cleanToken.length < 10) {
      return NextResponse.json({ valid: false, error: "Token too short" }, { status: 400 });
    }

    // Normalize base URL
    let url = baseUrl.replace(/\/+$/, "");

    // Strategy 1: Try /v1/models endpoint first (lightweight check)
    try {
      const modelsRes = await fetch(`${url}/models`, {
        headers: {
          "Authorization": `Bearer ${cleanToken}`,
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(8000),
      });

      if (modelsRes.ok) {
        const modelsData = await modelsRes.json();
        const models = (modelsData.data || []).map((m: { id: string }) => m.id);
        return NextResponse.json({
          valid: true,
          method: "models",
          models,
          modelCount: models.length,
          message: models.length > 0
            ? `Token valid — ${models.length} models available: ${models.slice(0, 5).join(", ")}${models.length > 5 ? "..." : ""}`
            : "Token accepted but no models listed",
        });
      }

      // If 401/403, token is invalid
      if (modelsRes.status === 401 || modelsRes.status === 403) {
        const errText = await modelsRes.text().catch(() => "");
        return NextResponse.json({
          valid: false,
          method: "models",
          error: `Authentication failed (${modelsRes.status})`,
          detail: errText.slice(0, 200),
        });
      }
    } catch {
      // /models endpoint might not exist, try chat completion
    }

    // Strategy 2: Try a minimal chat completion request
    const testModel = model || "deepseek-chat";
    try {
      const chatRes = await fetch(`${url}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${cleanToken}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 5,
          stream: false,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (chatRes.ok) {
        const chatData = await chatRes.json();
        const content = chatData.choices?.[0]?.message?.content;
        return NextResponse.json({
          valid: true,
          method: "chat",
          model: testModel,
          response: content ? String(content).slice(0, 100) : "(empty response)",
          message: `Token valid — ${testModel} responded successfully`,
        });
      }

      // Check specific error codes
      if (chatRes.status === 401 || chatRes.status === 403) {
        return NextResponse.json({
          valid: false,
          method: "chat",
          error: `Authentication failed (${chatRes.status}) — token expired or invalid`,
        });
      }

      if (chatRes.status === 404) {
        // Model not found — token might still be valid
        return NextResponse.json({
          valid: true,
          method: "chat",
          warning: `Token accepted but model "${testModel}" not found. Try a different model.`,
          error: `Model ${testModel} not available at this endpoint`,
        });
      }

      if (chatRes.status === 429) {
        // Rate limited — token IS valid but throttled
        return NextResponse.json({
          valid: true,
          method: "chat",
          warning: "Token valid but rate limited (429). Try again later.",
          message: "Token is valid — rate limited, try again shortly",
        });
      }

      const errBody = await chatRes.text().catch(() => "");
      return NextResponse.json({
        valid: false,
        method: "chat",
        error: `API returned ${chatRes.status}`,
        detail: errBody.slice(0, 300),
      });
    } catch (fetchErr: unknown) {
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);

      // Connection refused — bridge not running
      if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
        return NextResponse.json({
          valid: false,
          method: "chat",
          error: `Cannot connect to ${url} — bridge service not running`,
          suggestion: "Start the bridge service (e.g., ds2api) on this machine first",
        });
      }

      // Timeout
      if (msg.includes("abort") || msg.includes("timeout") || msg.includes("Timeout")) {
        return NextResponse.json({
          valid: false,
          method: "chat",
          error: "Connection timed out — bridge may be overloaded or unreachable",
        });
      }

      return NextResponse.json({
        valid: false,
        method: "chat",
        error: msg.slice(0, 200),
      });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ valid: false, error: `Validation failed: ${msg.slice(0, 100)}` }, { status: 500 });
  }
}
