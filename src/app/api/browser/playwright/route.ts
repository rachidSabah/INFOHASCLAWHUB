import { NextRequest, NextResponse } from "next/server";
import { sessionEngine } from "@/lib/session-engine";

export async function POST(req: NextRequest) {
  try {
    const { provider } = await req.json();
    if (!provider) return NextResponse.json({ error: "provider required" }, { status: 400 });

    const result = await sessionEngine.launchProvider(provider);
    if (result.token) {
      // Save to DB
      try { await sessionEngine.saveProviderConfig(provider, "http://localhost:8000/v1"); } catch {}
      return NextResponse.json({
        success: true,
        provider,
        token: result.token.slice(0, 30) + "...",
        models: result.models,
      });
    }
    return NextResponse.json({ success: false, error: result.error || "No token captured" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { provider } = await req.json();
  if (provider) await sessionEngine.closeProvider(provider);
  return NextResponse.json({ success: true });
}
