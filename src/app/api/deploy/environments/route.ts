import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function GET() {
  try {
    const environments = await db.deployEnvironment.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json(environments);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const environment = await db.deployEnvironment.create({ data: body });
    return NextResponse.json(environment);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
