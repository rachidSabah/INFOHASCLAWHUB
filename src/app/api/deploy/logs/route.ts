import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const environmentId = searchParams.get('environmentId');
    const limit = parseInt(searchParams.get('limit') || '50');

    if (!environmentId) {
      return NextResponse.json({ error: 'environmentId query parameter is required' }, { status: 400 });
    }

    const environment = await db.deployEnvironment.findUnique({ where: { id: environmentId } });
    if (!environment) {
      return NextResponse.json({ error: 'Deploy environment not found' }, { status: 404 });
    }

    // Simulate deployment logs based on environment state
    const logs = [
      {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Environment: ${environment.name} (${environment.type})`,
      },
      {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Project path: ${environment.projectPath}`,
      },
      {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Total deployments: ${environment.deployCount}`,
      },
      {
        timestamp: new Date().toISOString(),
        level: environment.status === 'failed' ? 'error' : 'info',
        message: `Current status: ${environment.status}`,
      },
    ];

    if (environment.lastDeploy) {
      logs.push({
        timestamp: environment.lastDeploy.toISOString(),
        level: 'info',
        message: `Last deployment: ${environment.lastDeploy.toISOString()}`,
      });
    }

    return NextResponse.json({ environmentId, logs: logs.slice(0, limit) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
