import { NextRequest, NextResponse } from "next/server";
import { AgentRunner, type AgentRunConfig } from "@/lib/agent-runner";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const runner = AgentRunner.getInstance();
    const runs = runner.getAllRuns();
    return NextResponse.json(runs);
  } catch (error) {
    console.error("[AGENTS_RUN_GET]", error);
    return NextResponse.json({ error: "Failed to fetch runs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, task, config } = body as {
      agentId: string;
      task: string;
      config?: AgentRunConfig;
    };

    if (!agentId || !task) {
      return NextResponse.json({ error: "agentId and task are required" }, { status: 400 });
    }

    const runner = AgentRunner.getInstance();
    const runId = runner.start(agentId, task, config || {});
    const status = runner.getStatus(runId);

    return NextResponse.json(status, { status: 201 });
  } catch (error) {
    console.error("[AGENTS_RUN_POST]", error);
    return NextResponse.json({ error: "Failed to start agent run" }, { status: 500 });
  }
}
