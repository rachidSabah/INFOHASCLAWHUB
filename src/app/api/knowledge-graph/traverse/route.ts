import { traverse } from '@/lib/knowledge-graph-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { entityId, direction, depth, relationTypes } = body as {
      entityId: string;
      direction?: string;
      depth?: number;
      relationTypes?: string[];
    };

    if (!entityId) {
      return NextResponse.json(
        { error: 'entityId is required' },
        { status: 400 }
      );
    }

    const result = await traverse(
      entityId,
      (direction as 'outgoing' | 'incoming' | 'both') ?? undefined,
      depth,
      relationTypes as Array<'depends_on' | 'related_to' | 'part_of' | 'owns' | 'uses' | 'produces' | 'blocks' | 'supports'> | undefined
    );
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
