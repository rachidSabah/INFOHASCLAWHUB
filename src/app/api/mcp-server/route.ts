import { getMCPServerEngine } from "@/lib/mcp-server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const engine = getMCPServerEngine();
    const config = engine.getConfig();
    const apiKey = await engine.getOrCreateApiKey();

    return NextResponse.json({
      running: true,
      port: config.port,
      enabled: config.enabled,
      apiKey: apiKey ? `${apiKey.slice(0, 10)}...` : null,
      maxConnections: config.maxConnections,
      allowedOrigins: config.allowedOrigins,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get MCP server status";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { action?: "start" | "stop"; port?: number };
    const engine = getMCPServerEngine();

    if (body.action === "start") {
      if (body.port) {
        await engine.updateConfig({ port: body.port });
      }
      // Load config from DB and ensure server is ready
      await engine.loadConfigFromDB();
      const config = engine.getConfig();
      return NextResponse.json({ success: true, status: "started", port: config.port });
    }

    if (body.action === "stop") {
      return NextResponse.json({ success: true, status: "stopped" });
    }

    return NextResponse.json({ error: "Invalid action. Use 'start' or 'stop'" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update MCP server";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    return NextResponse.json({ success: true, status: "stopped" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to stop MCP server";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
