import { NextRequest, NextResponse } from "next/server";
import { getHybridProviderRouter } from "@/lib/provider-router";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider, model, taskType, latency, success } = body;
    if (!provider || !model || !taskType || latency === undefined || success === undefined) {
      return NextResponse.json({ error: "provider, model, taskType, latency, success are required" }, { status: 400 });
    }
    await getHybridProviderRouter().recordExecution(body);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[ProviderRouter/Record] POST error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to record execution" }, { status: 500 });
  }
}
