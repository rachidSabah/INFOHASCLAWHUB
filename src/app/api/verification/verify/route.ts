import { verifyFile, verifyBatch } from '@/lib/verification-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isBatch = searchParams.get('batch') === 'true';

    if (isBatch) {
      const body = await request.json();
      const { filePaths } = body as { filePaths: string[] };

      if (!filePaths || !Array.isArray(filePaths)) {
        return NextResponse.json(
          { error: 'filePaths array is required' },
          { status: 400 }
        );
      }

      const result = await verifyBatch(filePaths);
      return NextResponse.json(result);
    }

    const body = await request.json();
    const { filePath } = body as { filePath: string };

    if (!filePath) {
      return NextResponse.json(
        { error: 'filePath is required' },
        { status: 400 }
      );
    }

    const result = await verifyFile(filePath);
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
