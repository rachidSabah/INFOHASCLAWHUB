import { NextResponse } from "next/server";
import { adaptWeights, validateReasoning, evolvePattern } from "@/lib/sona-engine";
import type { Outcome } from "@/lib/sona-engine";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Adapt weights: { patternId, newScore }
    if (body.patternId !== undefined && body.newScore !== undefined && body.actualOutcome === undefined && body.adaptations === undefined) {
      const { patternId, newScore } = body as { patternId?: string; newScore?: number };

      if (!patternId || typeof newScore !== "number") {
        return errorResponse("Missing required fields: patternId, newScore (number)", 400);
      }

      const result = await adaptWeights(patternId, newScore);
      return NextResponse.json(result);
    }

    // Validate reasoning: { entryId, actualOutcome }
    if (body.entryId !== undefined && body.actualOutcome !== undefined) {
      const { entryId, actualOutcome } = body as { entryId?: string; actualOutcome?: Outcome };

      if (!entryId || !actualOutcome) {
        return errorResponse("Missing required fields: entryId, actualOutcome (success|partial|failure)", 400);
      }

      if (!["success", "partial", "failure"].includes(actualOutcome)) {
        return errorResponse("Invalid actualOutcome. Must be 'success', 'partial', or 'failure'", 400);
      }

      const result = await validateReasoning(entryId, actualOutcome);
      if (!result) {
        return errorResponse("Reasoning entry not found", 404);
      }

      return NextResponse.json(result);
    }

    // Evolve pattern: { patternId, adaptations }
    if (body.patternId !== undefined && body.adaptations !== undefined) {
      const { patternId, adaptations } = body as {
        patternId?: string;
        adaptations?: Array<{ dimension: string; delta: number; reason: string }>;
      };

      if (!patternId || !Array.isArray(adaptations) || adaptations.length === 0) {
        return errorResponse("Missing required fields: patternId, adaptations (non-empty array of { dimension, delta, reason })", 400);
      }

      // Validate adaptations structure
      for (const adapt of adaptations) {
        if (typeof adapt.dimension !== "string" || typeof adapt.delta !== "number" || typeof adapt.reason !== "string") {
          return errorResponse("Each adaptation must have: dimension (string), delta (number), reason (string)", 400);
        }
      }

      const result = await evolvePattern(patternId, adaptations);
      return NextResponse.json(result);
    }

    return errorResponse(
      "Invalid body. Provide one of:\n" +
      "  { patternId, newScore } — adapt weights\n" +
      "  { entryId, actualOutcome } — validate reasoning\n" +
      "  { patternId, adaptations } — evolve pattern",
      400
    );
  } catch (error: unknown) {
    console.error("[SONA_LEARN]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (errorMessage.includes("not found")) {
      return errorResponse(errorMessage, 404);
    }

    return errorResponse(errorMessage, 500);
  }
}
