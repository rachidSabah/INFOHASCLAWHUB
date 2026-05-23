import { NextResponse } from "next/server";
import { listSwarms, createSwarm } from "@/lib/swarm-engine";
import type { SwarmTopology, ConsensusProtocol, SwarmStatus, SwarmConfig } from "@/lib/swarm-engine";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const topology = searchParams.get("topology") as SwarmTopology | null;
    const consensus = searchParams.get("consensus") as ConsensusProtocol | null;
    const status = searchParams.get("status") as SwarmStatus | null;

    const filter: { topology?: SwarmTopology; consensus?: ConsensusProtocol; status?: SwarmStatus } = {};
    if (topology) filter.topology = topology;
    if (consensus) filter.consensus = consensus;
    if (status) filter.status = status;

    const swarms = await listSwarms(filter);
    // Transform to format expected by SwarmCoordinationPanel
    const formattedSwarms = swarms.map(s => ({
      id: s.id,
      name: s.name,
      topology: s.topology,
      agentCount: s.agents.length,
      status: s.status === 'forming' ? 'inactive' : s.status === 'active' ? 'active' : s.status,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt),
    }));
    return NextResponse.json({ swarms: formattedSwarms });
  } catch (error: unknown) {
    console.error("[SWARM_LIST]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(errorMessage, 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, topology, consensus, description, maxAgents, config } = body as {
      name?: string;
      topology?: SwarmTopology;
      consensus?: ConsensusProtocol;
      description?: string;
      maxAgents?: number;
      config?: SwarmConfig;
    };

    if (!name) {
      return errorResponse("Missing required field: name", 400);
    }

    const swarmConfig: SwarmConfig = { ...config };
    if (maxAgents && swarmConfig.autoScaleConfig) {
      swarmConfig.autoScaleConfig.maxAgents = maxAgents;
    } else if (maxAgents) {
      swarmConfig.autoScaleConfig = {
        scaleUpThreshold: 0.8,
        scaleDownThreshold: 0.3,
        minAgents: 1,
        maxAgents,
        cooldownMs: 60000,
      };
    }

    const swarm = await createSwarm(name, topology, consensus, swarmConfig);

    // Patch description if provided (createSwarm doesn't accept description)
    if (description) {
      const { db } = await import("@/lib/db");
      await db.swarm.update({
        where: { id: swarm.id },
        data: { description },
      });
      swarm.description = description;
    }

    return NextResponse.json(swarm, { status: 201 });
  } catch (error: unknown) {
    console.error("[SWARM_CREATE]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(errorMessage, 500);
  }
}
