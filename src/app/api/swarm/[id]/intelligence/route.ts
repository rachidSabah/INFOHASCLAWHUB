import { NextRequest, NextResponse } from "next/server";
import {
  routeToSpecialist,
  selfHealSwarm,
  shareKnowledge,
  queryKnowledge,
  weightedConsensus,
} from "@/lib/swarm-engine";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: swarmId } = await params;
    const body = await req.json();
    const { action, ...data } = body;

    switch (action) {
      case "route_specialist": {
        const specialist = await routeToSpecialist(
          swarmId,
          data.taskDescription ?? "",
          data.requiredCapability ?? ""
        );
        return NextResponse.json(specialist);
      }

      case "self_heal": {
        const healResult = await selfHealSwarm(swarmId);
        return NextResponse.json(healResult);
      }

      case "share_knowledge": {
        const knowledge = await shareKnowledge(
          swarmId,
          data.category ?? "best_practice",
          data.insight ?? "",
          data.sourceAgentId ?? "",
          data.confidence ?? 0.5
        );
        return NextResponse.json(knowledge);
      }

      case "query_knowledge": {
        const results = await queryKnowledge(
          swarmId,
          data.category,
          data.query
        );
        return NextResponse.json(results);
      }

      case "weighted_consensus": {
        const consensus = await weightedConsensus(
          swarmId,
          data.proposal ?? "",
          data.options ?? []
        );
        return NextResponse.json(consensus);
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err: unknown) {
    console.error(
      "[SwarmIntelligence API] POST error:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: swarmId } = await params;
    const results = await queryKnowledge(swarmId);
    return NextResponse.json({
      knowledgeCount: results.length,
      recentKnowledge: results.slice(-10),
    });
  } catch (err: unknown) {
    console.error(
      "[SwarmIntelligence API] GET error:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
