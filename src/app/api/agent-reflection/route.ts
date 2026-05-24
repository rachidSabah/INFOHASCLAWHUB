import { NextRequest, NextResponse } from "next/server";
import { getAgentReflectionEngine } from "@/lib/agent-reflection";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      prompt: string;
      model?: string;
      options?: { enabled?: boolean; maxRounds?: number; strictness?: "lenient" | "moderate" | "strict" };
    };

    if (!body.prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const engine = getAgentReflectionEngine();
    const result = await engine.reflectAndRefine(body.prompt, body.model, body.options);

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to run reflection";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const engine = getAgentReflectionEngine();
    const stats = await engine.getReflectionStats();

    return NextResponse.json(stats);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get reflection stats";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
