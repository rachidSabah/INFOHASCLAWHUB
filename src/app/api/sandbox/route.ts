import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const sandboxes = await db.sandbox.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(sandboxes);
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
    const { name, framework, files, envVars } = body as {
      name: string;
      framework?: string;
      files?: Record<string, string>;
      envVars?: Record<string, string>;
    };

    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      );
    }

    const sandbox = await db.sandbox.create({
      data: {
        name,
        framework: framework || 'nextjs',
        files: JSON.stringify(files || {}),
        envVars: JSON.stringify(envVars || {}),
        status: 'creating',
      },
    });

    return NextResponse.json(sandbox, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
