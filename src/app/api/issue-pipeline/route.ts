import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const pipelines = await db.issuePipeline.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(pipelines);
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
    const { issueUrl, issueTitle, issueBody, repoUrl, maxIterations } = body as {
      issueUrl?: string;
      issueTitle?: string;
      issueBody?: string;
      repoUrl?: string;
      maxIterations?: number;
    };

    const title = issueTitle || "Untitled Issue";

    const pipeline = await db.issuePipeline.create({
      data: {
        issueUrl,
        issueTitle: title,
        issueBody,
        repoUrl,
        maxIterations: maxIterations ?? 5,
        status: 'planning',
      },
    });

    return NextResponse.json(pipeline, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
