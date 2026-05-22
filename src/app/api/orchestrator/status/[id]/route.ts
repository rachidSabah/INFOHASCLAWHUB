import { NextRequest, NextResponse } from "next/server";
import { Orchestrator } from "@/lib/orchestrator";

const orchestrator = Orchestrator.getInstance();

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const status = orchestrator.getStatus(id);

    if (!status) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const logs = orchestrator.getLogs(id);

    return NextResponse.json({
      projectId: status.projectId,
      prompt: status.prompt,
      workspacePath: status.workspacePath,
      boardId: status.boardId,
      status: status.status,
      category: status.category,
      currentTask: status.currentTask,
      startedAt: status.startedAt,
      completedAt: status.completedAt,
      milestones: status.milestones,
      tasks: status.tasks,
      completedTasks: status.completedTasks,
      totalTasks: status.totalTasks,
      generatedFiles: [],
      logs: logs.slice(-50),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
