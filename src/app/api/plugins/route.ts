import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const isInstalled = searchParams.get('isInstalled');

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (isInstalled !== null) where.isInstalled = isInstalled === 'true';

    const plugins = await db.plugin.findMany({
      where,
      orderBy: { installs: 'desc' },
    });
    return NextResponse.json(plugins);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, author, version, category, manifest, isEnabled, isInstalled, rating, installs } = body as {
      name: string;
      description: string;
      author: string;
      version: string;
      category: string;
      manifest?: Record<string, unknown> | string;
      isEnabled?: boolean;
      isInstalled?: boolean;
      rating?: number;
      installs?: number;
    };

    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      );
    }

    const plugin = await db.plugin.create({
      data: {
        name,
        description: description || '',
        author: author || 'unknown',
        version: version || '1.0.0',
        category: category || 'utility',
        manifest: typeof manifest === 'string' ? manifest : JSON.stringify(manifest || {}),
        isEnabled: isEnabled ?? false,
        isInstalled: isInstalled ?? false,
        rating: rating ?? 0,
        installs: installs ?? 0,
      },
    });

    return NextResponse.json(plugin, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
