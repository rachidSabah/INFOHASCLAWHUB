import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connectionId');

    if (!connectionId) {
      return NextResponse.json({ error: 'connectionId query parameter is required' }, { status: 400 });
    }

    const connection = await (db as any).databaseConnection.findUnique({ where: { id: connectionId } });
    if (!connection) {
      return NextResponse.json({ error: 'Database connection not found' }, { status: 404 });
    }

    const schemaSnapshot = connection.schemaSnapshot ? JSON.parse(connection.schemaSnapshot) : null;

    return NextResponse.json({
      connectionId,
      name: connection.name,
      type: connection.type,
      schema: schemaSnapshot,
      lastUpdated: connection.updatedAt,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
