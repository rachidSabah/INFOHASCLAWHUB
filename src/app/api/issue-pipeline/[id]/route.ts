import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const pipeline = await db.issuePipeline.findUnique({ where: { id } });

    if (!pipeline) {
      return NextResponse.json(
        { error: 'Pipeline not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(pipeline);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      status,
      plan,
      branchName,
      prUrl,
      prNumber,
      deployUrl,
      testResults,
      reviewNotes,
      iterations,
      maxIterations,
      issueUrl,
      issueBody,
      repoUrl,
    } = body as {
      status?: string;
      plan?: string;
      branchName?: string;
      prUrl?: string;
      prNumber?: number;
      deployUrl?: string;
      testResults?: string;
      reviewNotes?: string;
      iterations?: number;
      maxIterations?: number;
      issueUrl?: string;
      issueBody?: string;
      repoUrl?: string;
    };

    const existing = await db.issuePipeline.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Pipeline not found' },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (plan !== undefined) updateData.plan = plan;
    if (branchName !== undefined) updateData.branchName = branchName;
    if (prUrl !== undefined) updateData.prUrl = prUrl;
    if (prNumber !== undefined) updateData.prNumber = prNumber;
    if (deployUrl !== undefined) updateData.deployUrl = deployUrl;
    if (testResults !== undefined) updateData.testResults = testResults;
    if (reviewNotes !== undefined) updateData.reviewNotes = reviewNotes;
    if (iterations !== undefined) updateData.iterations = iterations;
    if (maxIterations !== undefined) updateData.maxIterations = maxIterations;
    if (issueUrl !== undefined) updateData.issueUrl = issueUrl;
    if (issueBody !== undefined) updateData.issueBody = issueBody;
    if (repoUrl !== undefined) updateData.repoUrl = repoUrl;

    const updated = await db.issuePipeline.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await db.issuePipeline.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Pipeline not found' },
        { status: 404 }
      );
    }

    await db.issuePipeline.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
