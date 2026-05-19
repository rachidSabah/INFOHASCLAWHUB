import { NextRequest, NextResponse } from "next/server";
import { AgentRunner } from "@/lib/agent-runner";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const runner = AgentRunner.getInstance();
    const run = runner.getStatus(id);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    return NextResponse.json(run);
  } catch (error) {
    console.error("[AGENTS_RUN_ID_GET]", error);
    return NextResponse.json({ error: "Failed to fetch run" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action } = body as { action: "stop" | "pause" | "resume" };

    const runner = AgentRunner.getInstance();
    const run = runner.getStatus(id);

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    switch (action) {
      case "stop":
        runner.stop(id);
        break;
      case "pause":
        runner.pause(id);
        break;
      case "resume":
        runner.resume(id);
        break;
      default:
        return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
    }

    return NextResponse.json(runner.getStatus(id));
  } catch (error) {
    console.error("[AGENTS_RUN_ID_POST]", error);
    return NextResponse.json({ error: "Failed to control run" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const runner = AgentRunner.getInstance();
    runner.stop(id);
    const deleted = runner.deleteRun(id);
    if (!deleted) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[AGENTS_RUN_ID_DELETE]", error);
    return NextResponse.json({ error: "Failed to delete run" }, { status: 500 });
  }
}
