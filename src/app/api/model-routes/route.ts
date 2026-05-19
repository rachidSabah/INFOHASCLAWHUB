import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function GET() {
  try {
    const routes = await db.modelRoute.findMany({ orderBy: { priority: 'desc' } });
    return NextResponse.json(routes);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const route = await db.modelRoute.create({ data: body });
    return NextResponse.json(route);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
