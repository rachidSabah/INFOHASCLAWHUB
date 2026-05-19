import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

let ZAI: any = null;
async function getZAI() {
  if (!ZAI) {
    const mod = await import('z-ai-web-dev-sdk');
    ZAI = mod.default;
  }
  return ZAI.create();
}



async function callAI(prompt: string) {
  try {
    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a compliance and security expert. Analyze the provided data for compliance issues. Return a JSON object with: "score" (0-100), "issues" (array of { category, severity, description, recommendation }), and "summary".' },
        { role: 'user', content: prompt }
      ],
    });
    return completion.choices[0]?.message?.content || '{}';
  } catch (error) {
    console.error('ZAI SDK error:', error);
    return '{}';
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { framework, projectPath } = body;

    // Gather security data
    const vulnerabilities = await db.securityVulnerability.findMany({
      where: projectPath ? { filePath: { startsWith: projectPath } } : {},
    });

    const exposedSecrets = await db.exposedSecret.findMany({
      where: { isRevoked: false },
    });

    const auditLogs = await db.securityAuditLog.findMany({
      where: { risk: { in: ['high', 'critical'] } },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });

    const contextData = JSON.stringify({
      vulnerabilities: vulnerabilities.length,
      unresolvedVulnerabilities: vulnerabilities.filter(v => !v.isResolved).length,
      exposedSecrets: exposedSecrets.length,
      highRiskActions: auditLogs.length,
      vulnerabilityBreakdown: {
        critical: vulnerabilities.filter(v => v.severity === 'critical').length,
        high: vulnerabilities.filter(v => v.severity === 'high').length,
        medium: vulnerabilities.filter(v => v.severity === 'medium').length,
      },
    });

    const aiResult = await callAI(
      `Perform a ${framework || 'general'} compliance check:\n\nProject data:\n${contextData}\n\nReturn compliance score, issues, and summary as JSON.`
    );

    let result;
    try {
      result = JSON.parse(aiResult);
    } catch {
      result = { score: 0, issues: [], summary: aiResult };
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
