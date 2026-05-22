import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const entries = await db.mCPRegistry.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ entries, count: entries.length });
  } catch (error: unknown) {
    console.error("[MCPRegistry] GET error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to list MCP registry" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, version, author, transport } = body;
    if (!name || !description || !version || !author || !transport) {
      return NextResponse.json({ error: "name, description, version, author, transport are required" }, { status: 400 });
    }
    const entry = await db.mCPRegistry.create({
      data: {
        name,
        description,
        version,
        author,
        transport,
        endpoint: body.endpoint || null,
        capabilities: JSON.stringify(body.capabilities || []),
        authType: body.authType || null,
        authConfig: body.authConfig ? JSON.stringify(body.authConfig) : null,
      },
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (error: unknown) {
    console.error("[MCPRegistry] POST error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to create MCP registry entry" }, { status: 500 });
  }
}
