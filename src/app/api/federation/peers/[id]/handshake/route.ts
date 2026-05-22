import { NextResponse } from "next/server";
import { initiateHandshake, completeHandshake } from "@/lib/federation-engine";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: peerId } = await params;
    const body = await req.json();

    // If publicKey and challenge are present → complete handshake
    // Otherwise → initiate handshake
    if (body.publicKey !== undefined || body.challenge !== undefined) {
      const { publicKey, challenge } = body as { publicKey?: string; challenge?: string };

      if (!publicKey || !challenge) {
        return errorResponse("Missing required fields: publicKey, challenge", 400);
      }

      const result = await completeHandshake(peerId, publicKey, challenge);
      return NextResponse.json(result);
    }

    // Initiate handshake (no body fields needed)
    const result = await initiateHandshake(peerId);
    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error("[FEDERATION_HANDSHAKE]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (
      errorMessage.includes("not found") ||
      errorMessage.includes("suspended") ||
      errorMessage.includes("evicted") ||
      errorMessage.includes("not in connecting") ||
      errorMessage.includes("Challenge mismatch")
    ) {
      return errorResponse(errorMessage, 400);
    }

    return errorResponse(errorMessage, 500);
  }
}
