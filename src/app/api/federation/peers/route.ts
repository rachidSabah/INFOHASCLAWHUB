import { NextResponse } from "next/server";
import { listPeers, registerPeer } from "@/lib/federation-engine";
import type { TrustLevel, PeerStatus, ComplianceMode } from "@/lib/federation-engine";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const trustLevel = searchParams.get("trustLevel") as TrustLevel | null;
    const status = searchParams.get("status") as PeerStatus | null;

    const filter: { trustLevel?: TrustLevel; status?: PeerStatus } = {};
    if (trustLevel) filter.trustLevel = trustLevel;
    if (status) filter.status = status;

    const peers = await listPeers(filter);
    return NextResponse.json(peers);
  } catch (error: unknown) {
    console.error("[FEDERATION_PEERS_LIST]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(errorMessage, 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, endpoint, complianceMode } = body as {
      name?: string;
      endpoint?: string;
      complianceMode?: ComplianceMode;
    };

    if (!name || !endpoint) {
      return errorResponse("Missing required fields: name, endpoint", 400);
    }

    const peer = await registerPeer(name, endpoint, complianceMode);
    return NextResponse.json(peer, { status: 201 });
  } catch (error: unknown) {
    console.error("[FEDERATION_PEERS_REGISTER]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (errorMessage.includes("already exists")) {
      return errorResponse(errorMessage, 409);
    }

    return errorResponse(errorMessage, 500);
  }
}
