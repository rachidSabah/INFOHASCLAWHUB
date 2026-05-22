import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sandbox = await db.sandbox.findUnique({ where: { id } });

    if (!sandbox) {
      return NextResponse.json(
        { error: 'Sandbox not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(sandbox);
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
    const { name, framework, status, port, containerId, previewUrl, files, envVars } = body as {
      name?: string;
      framework?: string;
      status?: string;
      port?: number;
      containerId?: string;
      previewUrl?: string;
      files?: Record<string, string>;
      envVars?: Record<string, string>;
    };

    const existing = await db.sandbox.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Sandbox not found' },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (framework !== undefined) updateData.framework = framework;
    if (status !== undefined) updateData.status = status;
    if (port !== undefined) updateData.port = port;
    if (containerId !== undefined) updateData.containerId = containerId;
    if (previewUrl !== undefined) updateData.previewUrl = previewUrl;
    if (files !== undefined) updateData.files = JSON.stringify(files);
    if (envVars !== undefined) updateData.envVars = JSON.stringify(envVars);

    const updated = await db.sandbox.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
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
    const existing = await db.sandbox.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'Sandbox not found' },
        { status: 404 }
      );
    }

    await db.sandbox.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
