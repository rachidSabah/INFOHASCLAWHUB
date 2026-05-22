import { verifyIntegrity } from '@/lib/encryption-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { vaultId, recordId } = body as {
      vaultId: string;
      recordId: string;
    };

    if (!vaultId || !recordId) {
      return NextResponse.json(
        { error: 'vaultId and recordId are required' },
        { status: 400 }
      );
    }

    const result = await verifyIntegrity(vaultId, recordId);
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
