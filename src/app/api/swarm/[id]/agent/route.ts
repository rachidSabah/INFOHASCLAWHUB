import { NextResponse } from "next/server";
import { addAgentToSwarm, removeAgentFromSwarm } from "@/lib/swarm-engine";
import type { AgentRole } from "@/lib/swarm-engine";

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
    const { agentId, role } = body as { agentId?: string; role?: AgentRole };

    if (!agentId) {
      return errorResponse("Missing required field: agentId", 400);
    }

    const swarm = await addAgentToSwarm(swarmId, agentId, role);
    return NextResponse.json(swarm, { status: 201 });
  } catch (error: unknown) {
    console.error("[SWARM_AGENT_ADD]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (errorMessage.includes("not found") || errorMessage.includes("already in swarm") || errorMessage.includes("max capacity")) {
      return errorResponse(errorMessage, 400);
    }

    return errorResponse(errorMessage, 500);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const swarmId = await resolveId(params);
    const body = await req.json();
    const { agentId } = body as { agentId?: string };

    if (!agentId) {
      return errorResponse("Missing required field: agentId", 400);
    }

    const swarm = await removeAgentFromSwarm(swarmId, agentId);
    return NextResponse.json(swarm);
  } catch (error: unknown) {
    console.error("[SWARM_AGENT_REMOVE]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (errorMessage.includes("not found") || errorMessage.includes("not in swarm")) {
      return errorResponse(errorMessage, 400);
    }

    return errorResponse(errorMessage, 500);
  }
}
