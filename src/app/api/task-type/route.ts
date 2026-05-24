import { NextRequest, NextResponse } from "next/server";
import { getTaskTypeDetector } from "@/lib/task-type-detector";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { prompt: string };

    if (!body.prompt) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const detector = getTaskTypeDetector();
    const result = await detector.detectTaskType(body.prompt);

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to detect task type";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const detector = getTaskTypeDetector();
    const preferences = detector.getRoutingPreferences();

    const result = Array.from(preferences.entries()).map(([type, pref]) => ({
      taskType: type,
      modelId: pref.modelId,
      priority: pref.priority,
      fallbackIds: pref.fallbackIds,
      updatedAt: pref.updatedAt,
    }));

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get routing preferences";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
