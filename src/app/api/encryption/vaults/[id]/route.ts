import { getVaultStatus, enableEncryption, disableEncryption } from '@/lib/encryption-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const vault = await getVaultStatus(id);
    if (!vault) {
      return NextResponse.json({ error: 'Vault not found' }, { status: 404 });
    }
    return NextResponse.json(vault);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { passphrase } = body as { passphrase: string };

    if (!passphrase) {
      return NextResponse.json(
        { error: 'passphrase is required' },
        { status: 400 }
      );
    }

    const vault = await enableEncryption(id, passphrase);
    return NextResponse.json(vault);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { passphrase } = body as { passphrase: string };

    if (!passphrase) {
      return NextResponse.json(
        { error: 'passphrase is required' },
        { status: 400 }
      );
    }

    const result = await disableEncryption(id, passphrase);
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
