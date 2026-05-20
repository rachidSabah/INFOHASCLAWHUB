import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const isInstalled = searchParams.get('isInstalled');

    const where: any = {};
    if (category) where.category = category;
    if (isInstalled !== null) where.isInstalled = isInstalled === 'true';

    const plugins = await db.plugin.findMany({
      where,
      orderBy: { installs: 'desc' },
    });
    return NextResponse.json(plugins);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const plugin = await db.plugin.create({ data: body });
    return NextResponse.json(plugin);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
