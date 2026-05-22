import { decryptRecord, decryptBulk } from '@/lib/encryption-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isBulk = searchParams.get('bulk') === 'true';

    if (isBulk) {
      const body = await request.json();
      const { vaultId, recordIds } = body as {
        vaultId: string;
        recordIds: string[];
      };

      if (!vaultId || !recordIds || !Array.isArray(recordIds)) {
        return NextResponse.json(
          { error: 'vaultId and recordIds array are required' },
          { status: 400 }
        );
      }

      const results = await decryptBulk(vaultId, recordIds);
      return NextResponse.json({ results });
    }

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

    const plaintext = await decryptRecord(vaultId, recordId);
    return NextResponse.json({ vaultId, recordId, plaintext });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
