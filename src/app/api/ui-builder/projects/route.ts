import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function GET() {
  try {
    const projects = await db.uIBuilderProject.findMany({ orderBy: { createdAt: 'desc' } });
    return NextResponse.json(projects);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const project = await db.uIBuilderProject.create({ data: body });
    return NextResponse.json(project);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
