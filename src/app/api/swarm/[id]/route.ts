import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSwarmStatus, disbandSwarm } from "@/lib/swarm-engine";
import type { SwarmTopology, SwarmStatus, SwarmConfig } from "@/lib/swarm-engine";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const swarm = await getSwarmStatus(id);

    if (!swarm) {
      return errorResponse("Swarm not found", 404);
    }

    return NextResponse.json(swarm);
  } catch (error: unknown) {
    console.error("[SWARM_GET]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(errorMessage, 500);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { name, topology, status } = body as {
      name?: string;
      topology?: SwarmTopology;
      status?: SwarmStatus;
    };

    const existing = await db.swarm.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse("Swarm not found", 404);
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (topology !== undefined) data.topology = topology;
    if (status !== undefined) data.status = status;

    if (Object.keys(data).length === 0) {
      return errorResponse("Nothing to update", 400);
    }

    const updated = await db.swarm.update({
      where: { id },
      data,
    });

    // Return the full swarm status
    const swarm = await getSwarmStatus(id);
    return NextResponse.json(swarm ?? updated);
  } catch (error: unknown) {
    console.error("[SWARM_PATCH]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(errorMessage, 500);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.swarm.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse("Swarm not found", 404);
    }

    await disbandSwarm(id);

    return NextResponse.json({ success: true, message: "Swarm disbanded" });
  } catch (error: unknown) {
    console.error("[SWARM_DELETE]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(errorMessage, 500);
  }
}
