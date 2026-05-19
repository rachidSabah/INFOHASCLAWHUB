import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function GET() {
  try {
    const connections = await db.databaseConnection.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json(connections);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const connection = await db.databaseConnection.create({ data: body });
    return NextResponse.json(connection);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
