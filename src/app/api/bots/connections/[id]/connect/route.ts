import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const connection = await db.botConnection.findUnique({ where: { id } });
    if (!connection) {
      return NextResponse.json({ error: 'Bot connection not found' }, { status: 404 });
    }
    if (connection.isConnected) {
      return NextResponse.json({ error: 'Bot is already connected' }, { status: 400 });
    }
    const updated = await db.botConnection.update({
      where: { id },
      data: { isConnected: true, lastActivity: new Date() },
    });
    return NextResponse.json(updated);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
