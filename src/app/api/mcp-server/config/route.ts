import { getMCPServerEngine } from "@/lib/mcp-server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const engine = getMCPServerEngine();
    const config = engine.getConfig();

    return NextResponse.json({
      port: config.port,
      enabledTools: [
        "clawhub_chat",
        "clawhub_list_models",
        "clawhub_list_agents",
        "clawhub_run_agent",
        "clawhub_search_memory",
        "clawhub_read_file",
        "clawhub_write_file",
        "clawhub_list_files",
        "clawhub_execute_command",
      ],
      allowedPatterns: config.allowedCommandPatterns,
      corsOrigins: config.allowedOrigins,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get MCP server config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      port?: number;
      allowedCommands?: string[];
      corsOrigins?: string[];
      enabledTools?: string[];
    };
    const engine = getMCPServerEngine();

    const update: Record<string, unknown> = {};
    if (body.port) update.port = body.port;
    if (body.allowedCommands) update.allowedCommandPatterns = body.allowedCommands;
    if (body.corsOrigins) update.allowedOrigins = body.corsOrigins;

    const updated = await engine.updateConfig(update);

    return NextResponse.json({
      success: true,
      config: {
        port: updated.port,
        allowedPatterns: updated.allowedCommandPatterns,
        corsOrigins: updated.allowedOrigins,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update MCP server config";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
