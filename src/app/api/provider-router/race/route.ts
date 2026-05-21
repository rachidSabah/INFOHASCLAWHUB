import { NextRequest, NextResponse } from "next/server";
import { getHybridProviderRouter } from "@/lib/provider-router";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, taskType, providers, timeout } = body;
    if (!prompt || !taskType || !providers || !Array.isArray(providers)) {
      return NextResponse.json({ error: "prompt, taskType, and providers array are required" }, { status: 400 });
    }
    const result = await getHybridProviderRouter().raceExecution({ prompt, taskType, providers, timeout });
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("[ProviderRouter/Race] POST error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Race execution failed" }, { status: 500 });
  }
}
