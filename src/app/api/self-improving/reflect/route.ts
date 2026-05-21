import { NextRequest, NextResponse } from "next/server";
import { getSelfImprovingEngine } from "@/lib/self-improving";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, since, minExperiences } = body;
    const reflection = await getSelfImprovingEngine().reflect({ agentId, since: since ? new Date(since) : undefined, minExperiences });
    return NextResponse.json(reflection);
  } catch (error: unknown) {
    console.error("[SelfImproving/Reflect] POST error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to reflect" }, { status: 500 });
  }
}
