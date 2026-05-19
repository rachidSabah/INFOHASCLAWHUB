import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await db.uIBuilderProject.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: 'UI Builder project not found' }, { status: 404 });
    }
    return NextResponse.json(project);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const project = await db.uIBuilderProject.update({ where: { id }, data: body });
    return NextResponse.json(project);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.uIBuilderProject.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
