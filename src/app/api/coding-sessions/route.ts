import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const sessions = await db.codingSession.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(sessions);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, workspacePath, task, status, approvalMode, iterations, maxIterations, plan, checkpoints, diffLog, testResults, result } = body as {
      title: string;
      workspacePath: string;
      task: string;
      status?: string;
      approvalMode?: string;
      iterations?: number;
      maxIterations?: number;
      plan?: string;
      checkpoints?: string;
      diffLog?: string;
      testResults?: string;
      result?: string;
    };

    if (!title || !workspacePath || !task) {
      return NextResponse.json(
        { error: 'title, workspacePath, and task are required' },
        { status: 400 }
      );
    }

    const session = await db.codingSession.create({
      data: {
        title,
        workspacePath,
        task,
        ...(status ? { status } : {}),
        ...(approvalMode ? { approvalMode } : {}),
        ...(iterations !== undefined ? { iterations } : {}),
        ...(maxIterations !== undefined ? { maxIterations } : {}),
        ...(plan ? { plan } : {}),
        ...(checkpoints ? { checkpoints } : {}),
        ...(diffLog ? { diffLog } : {}),
        ...(testResults ? { testResults } : {}),
        ...(result ? { result } : {}),
      },
    });
    return NextResponse.json(session, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
