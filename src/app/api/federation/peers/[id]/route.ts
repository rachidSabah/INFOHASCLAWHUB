import { NextResponse } from "next/server";
import { getPeerStatus, evictPeer } from "@/lib/federation-engine";

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
    const peer = await getPeerStatus(id);

    if (!peer) {
      return errorResponse("Peer not found", 404);
    }

    return NextResponse.json(peer);
  } catch (error: unknown) {
    console.error("[FEDERATION_PEER_GET]", error);
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

    const existing = await getPeerStatus(id);
    if (!existing) {
      return errorResponse("Peer not found", 404);
    }

    const evicted = await evictPeer(id);
    return NextResponse.json(evicted);
  } catch (error: unknown) {
    console.error("[FEDERATION_PEER_EVICT]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (errorMessage.includes("not found")) {
      return errorResponse(errorMessage, 404);
    }

    return errorResponse(errorMessage, 500);
  }
}
