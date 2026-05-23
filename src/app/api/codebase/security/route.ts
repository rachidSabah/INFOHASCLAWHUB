import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectPath = searchParams.get('projectPath');
    const severity = searchParams.get('severity');

    const where: any = {};
    if (projectPath) where.filePath = { startsWith: projectPath };
    if (severity) where.severity = severity;

    const vulnerabilities = await (db as any).securityVulnerability.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const summary = {
      critical: vulnerabilities.filter((v: any) => v.severity === 'critical').length,
      high: vulnerabilities.filter((v: any) => v.severity === 'high').length,
      medium: vulnerabilities.filter((v: any) => v.severity === 'medium').length,
      low: vulnerabilities.filter((v: any) => v.severity === 'low').length,
      info: vulnerabilities.filter((v: any) => v.severity === 'info').length,
      total: vulnerabilities.length,
      resolved: vulnerabilities.filter((v: any) => v.isResolved).length,
    };

    return NextResponse.json({ summary, vulnerabilities });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
