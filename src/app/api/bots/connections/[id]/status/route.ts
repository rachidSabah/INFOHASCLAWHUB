import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const connection = await db.botConnection.findUnique({ where: { id } });
    if (!connection) {
      return NextResponse.json({ error: 'Bot connection not found' }, { status: 404 });
    }
    return NextResponse.json({
      id: connection.id,
      platform: connection.platform,
      name: connection.name,
      isConnected: connection.isConnected,
      botEnabled: connection.botEnabled,
      connectedNumber: connection.connectedNumber,
      lastActivity: connection.lastActivity,
      status: connection.isConnected
        ? (connection.botEnabled ? 'active' : 'paused')
        : 'disconnected',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
