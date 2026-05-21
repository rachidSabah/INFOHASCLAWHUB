import { scanInput, scanOutput } from '@/lib/ai-defence-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isOutput = searchParams.get('output') === 'true';

    const body = await request.json();

    if (isOutput) {
      const { content, agentId, sessionId } = body as {
        content: string;
        agentId?: string;
        sessionId?: string;
      };

      if (!content) {
        return NextResponse.json(
          { error: 'content is required' },
          { status: 400 }
        );
      }

      const result = await scanOutput(content, agentId, sessionId);
      return NextResponse.json(result);
    }

    const { content, source, agentId, sessionId } = body as {
      content: string;
      source: string;
      agentId?: string;
      sessionId?: string;
    };

    if (!content || !source) {
      return NextResponse.json(
        { error: 'content and source are required' },
        { status: 400 }
      );
    }

    const result = await scanInput(content, source as 'user_input' | 'api_request' | 'agent_output' | 'file_upload', agentId, sessionId);
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
