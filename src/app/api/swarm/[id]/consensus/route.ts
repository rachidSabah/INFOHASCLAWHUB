import { NextResponse } from "next/server";
import { initiateConsensus, castVote } from "@/lib/swarm-engine";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: swarmId } = await params;
    const body = await req.json();

    // If `proposal` is present → initiate consensus round
    // If `round`, `voterId`, `vote` are present → cast vote
    if (body.proposal !== undefined) {
      const { proposal } = body as { proposal?: string };
      if (!proposal) {
        return errorResponse("Missing required field: proposal", 400);
      }
      const round = await initiateConsensus(swarmId, proposal);
      return NextResponse.json(round, { status: 201 });
    }

    if (body.round !== undefined && body.voterId !== undefined && body.vote !== undefined) {
      const { round, voterId, vote } = body as {
        round?: number;
        voterId?: string;
        vote?: "for" | "against" | "abstain";
      };

      if (typeof round !== "number" || !voterId || !vote) {
        return errorResponse("Missing required fields: round (number), voterId, vote (for|against|abstain)", 400);
      }

      if (!["for", "against", "abstain"].includes(vote)) {
        return errorResponse("Invalid vote value. Must be 'for', 'against', or 'abstain'", 400);
      }

      const result = await castVote(swarmId, round, voterId, vote);
      return NextResponse.json(result);
    }

    return errorResponse(
      "Invalid body. Provide either { proposal } to initiate consensus or { round, voterId, vote } to cast a vote",
      400
    );
  } catch (error: unknown) {
    console.error("[SWARM_CONSENSUS]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (
      errorMessage.includes("not found") ||
      errorMessage.includes("no agents") ||
      errorMessage.includes("already voted") ||
      errorMessage.includes("already") ||
      errorMessage.includes("not a member")
    ) {
      return errorResponse(errorMessage, 400);
    }

    return errorResponse(errorMessage, 500);
  }
}
