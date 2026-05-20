import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pluginId } = body;

    if (!pluginId) {
      return NextResponse.json({ error: 'pluginId is required' }, { status: 400 });
    }

    const plugin = await db.plugin.findUnique({ where: { id: pluginId } });
    if (!plugin) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 });
    }

    if (plugin.isInstalled) {
      return NextResponse.json({ error: 'Plugin is already installed' }, { status: 400 });
    }

    const updated = await db.plugin.update({
      where: { id: pluginId },
      data: {
        isInstalled: true,
        isEnabled: true,
        installs: plugin.installs + 1,
      },
    });

    return NextResponse.json({ success: true, plugin: updated });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
