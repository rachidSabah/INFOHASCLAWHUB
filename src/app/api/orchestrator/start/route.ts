import { NextRequest, NextResponse } from "next/server";
import { Orchestrator } from "@/lib/orchestrator";
import { db } from "@/lib/db";

const orchestrator = Orchestrator.getInstance();
orchestrator.setDb(db);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, workspacePath } = body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 5) {
      return NextResponse.json({ error: "Prompt must be at least 5 characters" }, { status: 400 });
    }

    if (!workspacePath || typeof workspacePath !== "string") {
      return NextResponse.json({ error: "workspacePath is required" }, { status: 400 });
    }

    const projectId = await orchestrator.startProject(prompt.trim(), workspacePath.trim());

    const status = orchestrator.getStatus(projectId);

    return NextResponse.json({
      projectId,
      boardId: status?.boardId || "",
      plan: {
        milestones: status?.milestones || [],
        tasks: status?.tasks || [],
      },
      status: status?.status || "analyzing",
    }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
