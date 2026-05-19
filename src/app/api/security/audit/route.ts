import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId');
    const risk = searchParams.get('risk');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: any = {};
    if (agentId) where.agentId = agentId;
    if (risk) where.risk = risk;

    const logs = await db.securityAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json(logs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
