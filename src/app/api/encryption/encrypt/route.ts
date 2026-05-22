import { encryptRecord, encryptBulk } from '@/lib/encryption-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isBulk = searchParams.get('bulk') === 'true';

    if (isBulk) {
      const body = await request.json();
      const { vaultId, records } = body as {
        vaultId: string;
        records: Array<{ recordType: string; recordId: string; plaintext: string }>;
      };

      if (!vaultId || !records || !Array.isArray(records)) {
        return NextResponse.json(
          { error: 'vaultId and records array are required' },
          { status: 400 }
        );
      }

      const results = await encryptBulk(vaultId, records);
      return NextResponse.json({ results });
    }

    const body = await request.json();
    const { vaultId, recordType, recordId, plaintext } = body as {
      vaultId: string;
      recordType: string;
      recordId: string;
      plaintext: string;
    };

    if (!vaultId || !recordType || !recordId || !plaintext) {
      return NextResponse.json(
        { error: 'vaultId, recordType, recordId, and plaintext are required' },
        { status: 400 }
      );
    }

    const record = await encryptRecord(vaultId, recordType, recordId, plaintext);
    return NextResponse.json(record, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
