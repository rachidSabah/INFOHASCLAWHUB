import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sessions = await db.collabSession.findMany({
      where: { status: "active" },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ sessions, count: sessions.length });
  } catch (error: unknown) {
    console.error("[Collab] GET error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to list sessions" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, hostId } = body;
    if (!name || !hostId) {
      return NextResponse.json({ error: "name and hostId are required" }, { status: 400 });
    }
    const session = await db.collabSession.create({
      data: {
        name,
        hostId,
        peers: JSON.stringify([{ id: hostId, name: "Host", cursor: null, color: "#3b82f6" }]),
        status: "active",
        sharedAgent: body.sharedAgent || null,
      },
    });
    return NextResponse.json(session, { status: 201 });
  } catch (error: unknown) {
    console.error("[Collab] POST error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}
