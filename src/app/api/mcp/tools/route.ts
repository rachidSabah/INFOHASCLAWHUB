import { NextRequest, NextResponse } from "next/server";
import { MCPClient, getMcpServerConfigs, type MCPTool } from "@/lib/mcp";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const configs = await getMcpServerConfigs();
    const results: { name: string; tools: MCPTool[]; error?: string }[] = [];

    for (const config of configs) {
      const client = new MCPClient(config);
      try {
        await client.connect();
        const tools = await client.listTools();
        results.push({ name: config.name, tools });
      } catch (err: any) {
        results.push({ name: config.name, tools: [], error: err.message });
      } finally {
        client.disconnect();
      }
    }

    return NextResponse.json({ servers: results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list MCP tools";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
