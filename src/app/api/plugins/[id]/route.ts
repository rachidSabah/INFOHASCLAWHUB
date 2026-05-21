import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const plugin = await db.plugin.findUnique({ where: { id } });
    if (!plugin) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });
    }
    return NextResponse.json(plugin);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, author, version, category, manifest, isEnabled, isInstalled, rating, installs } = body as {
      name?: string;
      description?: string;
      author?: string;
      version?: string;
      category?: string;
      manifest?: Record<string, unknown> | string;
      isEnabled?: boolean;
      isInstalled?: boolean;
      rating?: number;
      installs?: number;
    };

    const existing = await db.plugin.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (author !== undefined) updateData.author = author;
    if (version !== undefined) updateData.version = version;
    if (category !== undefined) updateData.category = category;
    if (manifest !== undefined) {
      updateData.manifest = typeof manifest === 'string' ? manifest : JSON.stringify(manifest);
    }
    if (isEnabled !== undefined) updateData.isEnabled = isEnabled;
    if (isInstalled !== undefined) updateData.isInstalled = isInstalled;
    if (rating !== undefined) updateData.rating = rating;
    if (installs !== undefined) updateData.installs = installs;

    const plugin = await db.plugin.update({ where: { id }, data: updateData });
    return NextResponse.json(plugin);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await db.plugin.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });
    }
    await db.plugin.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
