import { NextResponse } from "next/server";
import { distributeTask } from "@/lib/swarm-engine";
import type { TaskPriority } from "@/lib/swarm-engine";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function resolveId(params: Promise<{ id: string }> | { id: string }) {
  const resolved = await params;
  return resolved.id;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const swarmId = await resolveId(params);
    const body = await req.json();
    const { task, priority } = body as { task?: string; priority?: TaskPriority };

    if (!task) {
      return errorResponse("Missing required field: task", 400);
    }

    const result = await distributeTask(swarmId, task, priority);
    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error("[SWARM_TASK_DISTRIBUTE]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (errorMessage.includes("not found") || errorMessage.includes("not active")) {
      return errorResponse(errorMessage, 400);
    }

    return errorResponse(errorMessage, 500);
  }
}
