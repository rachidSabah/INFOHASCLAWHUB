import { NextRequest, NextResponse } from 'next/server';
import { getIssuePipelineEngine } from '@/lib/issue-pipeline';

export async function GET() {
  try {
    const engine = getIssuePipelineEngine();
    const pipelines = await engine.getAllPipelines();
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
    const { issueUrl, issueTitle, issueBody, repoUrl } = body as {
      issueUrl?: string;
      issueTitle: string;
      issueBody?: string;
      repoUrl?: string;
    };

    if (!issueTitle) {
      return NextResponse.json(
        { error: 'issueTitle is required' },
        { status: 400 }
      );
    }

    const engine = getIssuePipelineEngine();
    const pipelineId = await engine.startPipeline({
      issueUrl,
      issueTitle,
      issueBody,
      repoUrl,
    });
    return NextResponse.json({ id: pipelineId }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
