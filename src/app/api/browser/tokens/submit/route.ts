import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * POST /api/browser/tokens/submit
 * Receives tokens from bookmarklets, browser extensions, or CDP connections.
 * Stores them in a JSON file so the WebBridge panel can pick them up.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, provider, source, browser } = body as {
      token: string;
      provider: string;
      source?: string;
      browser?: string;
    };

    if (!token || typeof token !== "string" || token.length < 20) {
      return NextResponse.json(
        { ok: false, error: "Token too short or missing (min 20 chars)" },
        { status: 400 }
      );
    }

    if (!provider || typeof provider !== "string") {
      return NextResponse.json(
        { ok: false, error: "Provider name is required" },
        { status: 400 }
      );
    }

    // Clean the token — strip Bearer prefix if present
    const cleanToken = token
      .replace(/^Bearer\s+/i, "")
      .replace(/^Authorization:\s*Bearer\s+/i, "")
      .trim();

    // Store in the submitted-tokens directory
    const tokensDir = join(process.cwd(), ".submitted-tokens");
    if (!existsSync(tokensDir)) {
      mkdirSync(tokensDir, { recursive: true });
    }

    const tokenFile = join(tokensDir, `${provider}.json`);

    // Read existing tokens
    let existing: Array<{
      token: string;
      provider: string;
      source: string;
      browser: string;
      timestamp: string;
    }> = [];
    if (existsSync(tokenFile)) {
      try {
        existing = JSON.parse(readFileSync(tokenFile, "utf-8"));
      } catch {
        existing = [];
      }
    }

    // Check for duplicates
    const isDuplicate = existing.some((t) => t.token === cleanToken);
    if (isDuplicate) {
      return NextResponse.json({
        ok: true,
        message: "Token already submitted (duplicate)",
        duplicate: true,
      });
    }

    // Add the new token
    existing.push({
      token: cleanToken,
      provider,
      source: source || "bookmarklet",
      browser: browser || "external",
      timestamp: new Date().toISOString(),
    });

    // Keep only the last 10 tokens per provider
    if (existing.length > 10) {
      existing = existing.slice(-10);
    }

    writeFileSync(tokenFile, JSON.stringify(existing, null, 2));

    return NextResponse.json({
      ok: true,
      message: `Token for "${provider}" saved successfully`,
      provider,
      source: source || "bookmarklet",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: `Failed to save token: ${msg.slice(0, 100)}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/browser/tokens/submit?provider=deepseek
 * Returns submitted tokens for a provider (or all if no provider specified).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const provider = searchParams.get("provider");

    const tokensDir = join(process.cwd(), ".submitted-tokens");
    if (!existsSync(tokensDir)) {
      return NextResponse.json({ tokens: [] });
    }

    const { readdirSync } = await import("fs");
    const files = readdirSync(tokensDir).filter((f) => f.endsWith(".json"));

    const allTokens: Array<{
      token: string;
      provider: string;
      source: string;
      browser: string;
      timestamp: string;
    }> = [];

    for (const file of files) {
      const provName = file.replace(".json", "");
      if (provider && provName !== provider) continue;
      try {
        const data = JSON.parse(
          readFileSync(join(tokensDir, file), "utf-8")
        );
        allTokens.push(...data);
      } catch {}
    }

    return NextResponse.json({ tokens: allTokens });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { tokens: [], error: msg.slice(0, 100) },
      { status: 500 }
    );
  }
}
