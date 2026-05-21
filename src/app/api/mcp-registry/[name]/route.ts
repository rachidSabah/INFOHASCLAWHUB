import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    const entry = await db.mCPRegistry.findUnique({ where: { name } });
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(entry);
  } catch (error: unknown) {
    console.error("[MCPRegistry] GET by name error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to get MCP entry" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    const body = await req.json();
    const entry = await db.mCPRegistry.update({
      where: { name },
      data: {
        ...(body.description !== undefined && { description: body.description }),
        ...(body.version !== undefined && { version: body.version }),
        ...(body.isEnabled !== undefined && { isEnabled: body.isEnabled }),
        ...(body.isVerified !== undefined && { isVerified: body.isVerified }),
        ...(body.capabilities !== undefined && { capabilities: JSON.stringify(body.capabilities) }),
      },
    });
    return NextResponse.json(entry);
  } catch (error: unknown) {
    console.error("[MCPRegistry] PATCH error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to update MCP entry" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    await db.mCPRegistry.delete({ where: { name } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("[MCPRegistry] DELETE error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to delete MCP entry" }, { status: 500 });
  }
}
