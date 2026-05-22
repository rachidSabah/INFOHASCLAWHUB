import { NextRequest, NextResponse } from "next/server";
import { getHybridProviderRouter } from "@/lib/provider-router";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Accept the record with reasonable defaults for missing fields
    const record = {
      provider: body.provider || "unknown",
      model: body.model || "unknown",
      taskType: body.taskType || "general",
      latency: body.latency ?? 0,
      success: body.success ?? true,
      ...body,
    };
    await getHybridProviderRouter().recordExecution(record);
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error: unknown) {
    console.error("[ProviderRouter/Record] POST error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to record execution" }, { status: 500 });
  }
}
