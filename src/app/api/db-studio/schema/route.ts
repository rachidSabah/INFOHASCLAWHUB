import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get('connectionId');

    // If no connectionId, list all connections with their schemas
    if (!connectionId) {
      const connections = await (db as any).databaseConnection.findMany({
        orderBy: { name: 'asc' },
      });
      const result = connections.map((c: any) => ({
        connectionId: c.id,
        name: c.name,
        type: c.type,
        schema: c.schemaSnapshot ? JSON.parse(c.schemaSnapshot) : null,
        lastUpdated: c.updatedAt,
      }));
      return NextResponse.json({ connections: result, count: result.length });
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
