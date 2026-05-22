import { NextResponse } from "next/server";
import { suspendPeer } from "@/lib/federation-engine";

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

    const peer = await suspendPeer(peerId);
    return NextResponse.json(peer);
  } catch (error: unknown) {
    console.error("[FEDERATION_PEER_SUSPEND]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (errorMessage.includes("not found") || errorMessage.includes("evicted")) {
      return errorResponse(errorMessage, 400);
    }

    return errorResponse(errorMessage, 500);
  }
}
