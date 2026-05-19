import { NextRequest, NextResponse } from "next/server";
import { MCPClient, getMcpServerConfigs } from "@/lib/mcp";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { server: serverName, tool, args = {} } = body;

    if (!serverName || !tool) {
      return NextResponse.json({ error: "Server name and tool name are required" }, { status: 400 });
    }

    const configs = await getMcpServerConfigs();
    const config = configs.find((c) => c.name === serverName);

    if (!config) {
      return NextResponse.json({ error: `MCP server "${serverName}" not found` }, { status: 404 });
    }

    const client = new MCPClient(config);
    try {
      await client.connect();
      const result = await client.callTool(tool, args);
      return NextResponse.json({ result });
    } finally {
      client.disconnect();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to execute MCP tool";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
