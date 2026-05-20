import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import type { MCPServerConfig } from "@/lib/mcp";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const entry = await db.settings.findUnique({ where: { key: "mcp_servers" } });
    if (!entry) return NextResponse.json([]);
    return NextResponse.json(JSON.parse(entry.value) as MCPServerConfig[]);
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as MCPServerConfig;

    if (!body.name || !body.command) {
      return NextResponse.json({ error: "Name and command are required" }, { status: 400 });
    }

    const existing = await db.settings.findUnique({ where: { key: "mcp_servers" } });
    let servers: MCPServerConfig[] = [];

    if (existing) {
      try {
        servers = JSON.parse(existing.value);
      } catch {
        servers = [];
      }
    }

    servers.push({
      name: body.name,
      command: body.command,
      args: body.args || [],
      env: body.env || {},
    });

    await db.settings.upsert({
      where: { key: "mcp_servers" },
      update: { value: JSON.stringify(servers) },
      create: { key: "mcp_servers", value: JSON.stringify(servers) },
    });

    return NextResponse.json({ success: true, servers });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to add MCP server";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
