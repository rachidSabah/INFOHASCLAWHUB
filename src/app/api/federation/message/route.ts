import { NextResponse } from "next/server";
import { sendFederationMessage } from "@/lib/federation-engine";
import { db } from "@/lib/db";
import type { MessageType, Direction } from "@/lib/federation-engine";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { peerId, messageType, payload } = body as {
      peerId?: string;
      messageType?: MessageType;
      payload?: Record<string, unknown>;
    };

    if (!peerId || !messageType || !payload) {
      return errorResponse("Missing required fields: peerId, messageType, payload", 400);
    }

    const message = await sendFederationMessage(peerId, messageType, payload);
    return NextResponse.json(message, { status: 201 });
  } catch (error: unknown) {
    console.error("[FEDERATION_MESSAGE_SEND]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (
      errorMessage.includes("not found") ||
      errorMessage.includes("suspended") ||
      errorMessage.includes("evicted") ||
      errorMessage.includes("blocked")
    ) {
      return errorResponse(errorMessage, 400);
    }

    return errorResponse(errorMessage, 500);
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const peerId = searchParams.get("peerId");
    const direction = searchParams.get("direction") as Direction | null;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    const where: Record<string, unknown> = {};
    if (peerId) where.peerId = peerId;
    if (direction) where.direction = direction;

    const messages = await db.federationMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 200),
    });

    return NextResponse.json(
      messages.map((msg) => ({
        id: msg.id,
        peerId: msg.peerId,
        direction: msg.direction,
        messageType: msg.messageType,
        payload: JSON.parse(typeof msg.payload === "string" ? msg.payload : JSON.stringify(msg.payload)),
        piiScanned: msg.piiScanned,
        piiDetected: JSON.parse(typeof msg.piiDetected === "string" ? msg.piiDetected : JSON.stringify(msg.piiDetected ?? "[]")),
        signed: msg.signed,
        signature: msg.signature,
        createdAt: msg.createdAt,
      }))
    );
  } catch (error: unknown) {
    console.error("[FEDERATION_MESSAGE_GET]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(errorMessage, 500);
  }
}
