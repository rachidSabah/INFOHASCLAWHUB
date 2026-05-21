import { listWitnesses, createWitness } from '@/lib/verification-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const verified = searchParams.get('verified');

    const filter: Record<string, unknown> = {};
    if (verified !== null) filter.verified = verified === 'true';

    const witnesses = await listWitnesses(filter);
    return NextResponse.json(witnesses);
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
    const { filePath, commitHash } = body as {
      filePath: string;
      commitHash?: string;
    };

    if (!filePath) {
      return NextResponse.json(
        { error: 'filePath is required' },
        { status: 400 }
      );
    }

    const witness = await createWitness(filePath, commitHash);
    return NextResponse.json(witness, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
