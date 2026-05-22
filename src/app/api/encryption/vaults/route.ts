import { listVaults, createVault } from '@/lib/encryption-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const vaults = await listVaults();
    return NextResponse.json(vaults);
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
    const { storeName, algorithm, keyDerivation } = body as {
      storeName: string;
      algorithm?: string;
      keyDerivation?: string;
    };

    if (!storeName) {
      return NextResponse.json(
        { error: 'storeName is required' },
        { status: 400 }
      );
    }

    const vault = await createVault(storeName, { algorithm, keyDerivation });
    return NextResponse.json(vault, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
