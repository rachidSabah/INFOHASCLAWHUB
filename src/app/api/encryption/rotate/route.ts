import { rotateKey } from '@/lib/encryption-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { vaultId, newPassphrase } = body as {
      vaultId: string;
      newPassphrase: string;
    };

    if (!vaultId || !newPassphrase) {
      return NextResponse.json(
        { error: 'vaultId and newPassphrase are required' },
        { status: 400 }
      );
    }

    const result = await rotateKey(vaultId, newPassphrase);
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
