import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import type { MCPServerConfig } from "@/lib/mcp";

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const decodedName = decodeURIComponent(name);

    const entry = await db.settings.findUnique({ where: { key: "mcp_servers" } });
    if (!entry) {
      return NextResponse.json({ error: "No MCP servers configured" }, { status: 404 });
    }

    let servers: MCPServerConfig[] = [];
    try {
      servers = JSON.parse(entry.value);
    } catch {
      servers = [];
    }

    const filtered = servers.filter((s) => s.name !== decodedName);
    if (filtered.length === servers.length) {
      return NextResponse.json({ error: `MCP server "${decodedName}" not found` }, { status: 404 });
    }

    await db.settings.upsert({
      where: { key: "mcp_servers" },
      update: { value: JSON.stringify(filtered) },
      create: { key: "mcp_servers", value: JSON.stringify(filtered) },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete MCP server";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
