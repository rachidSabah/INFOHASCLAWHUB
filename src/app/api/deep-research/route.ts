import { NextRequest, NextResponse } from "next/server";
import { getDeepResearchEngine } from "@/lib/deep-research";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      query: string;
      depth?: "quick" | "standard" | "deep" | "exhaustive";
      model?: string;
    };

    if (!body.query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    // Map "exhaustive" to "deep" since the engine supports quick/standard/deep
    const depth = body.depth === "exhaustive" ? "deep" : (body.depth ?? "standard");

    const engine = getDeepResearchEngine();
    const session = await engine.startResearch(body.query, {
      depth: depth as "quick" | "standard" | "deep",
      model: body.model,
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to start deep research";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const engine = getDeepResearchEngine();
    const session = engine.getResearchStatus(sessionId);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get research status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
