import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

let ZAI: unknown = null;
async function getZAI() {
  if (!ZAI) {
    const mod = await import('z-ai-web-dev-sdk');
    ZAI = mod.default;
  }
  return (ZAI as any).create();
}

async function callAI(prompt: string): Promise<string> {
  try {
    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a compliance and security expert. Analyze the provided data for compliance issues. Return a JSON object with: "score" (0-100), "issues" (array of { category, severity, description, recommendation }), and "summary".' },
        { role: 'user', content: prompt }
      ],
    });
    const result = completion.choices[0]?.message?.content;
    if (result && result.trim() && result.trim() !== '{}') return result;
  } catch (error: unknown) {
    console.error('[Compliance] ZAI SDK error:', error);
  }
  return generateComplianceFallback(prompt);
}

function generateComplianceFallback(prompt: string): string {
  const vulnMatch = prompt.match(/unresolvedVulnerabilities[":\s]+(\d+)/);
  const secretsMatch = prompt.match(/exposedSecrets[":\s]+(\d+)/);
  const highRiskMatch = prompt.match(/highRiskActions[":\s]+(\d+)/);

  const unresolvedVulns = vulnMatch ? parseInt(vulnMatch[1]) : 0;
  const exposedSecrets = secretsMatch ? parseInt(secretsMatch[1]) : 0;
  const highRiskActions = highRiskMatch ? parseInt(highRiskMatch[1]) : 0;

  let score = 100;
  score -= unresolvedVulns * 10;
  score -= exposedSecrets * 15;
  score -= highRiskActions * 5;
  score = Math.max(0, Math.min(100, score));

  const issues: Array<{ category: string; severity: string; description: string; recommendation: string }> = [];

  if (exposedSecrets > 0) {
    issues.push({
      category: 'secrets_management',
      severity: 'critical',
      description: `${exposedSecrets} exposed secret(s) found that have not been revoked`,
      recommendation: 'Immediately revoke and rotate all exposed secrets. Use environment variables or a secrets manager.',
    });
  }
  if (unresolvedVulns > 0) {
    issues.push({
      category: 'vulnerability_management',
      severity: unresolvedVulns > 3 ? 'high' : 'medium',
      description: `${unresolvedVulns} unresolved security vulnerabilit(ies) detected`,
      recommendation: 'Prioritize and remediate security vulnerabilities, starting with critical and high severity items.',
    });
  }
  if (highRiskActions > 0) {
    issues.push({
      category: 'access_control',
      severity: 'high',
      description: `${highRiskActions} high-risk action(s) recorded in audit logs`,
      recommendation: 'Review audit logs for unauthorized access and implement stricter access controls.',
    });
  }

  if (issues.length === 0) {
    issues.push(
      { category: 'encryption', severity: 'info', description: 'Verify data encryption at rest and in transit', recommendation: 'Ensure TLS is enforced and sensitive data is encrypted in the database.' },
      { category: 'authentication', severity: 'info', description: 'Verify authentication mechanisms', recommendation: 'Ensure multi-factor authentication is enabled and strong password policies are in place.' },
      { category: 'logging', severity: 'info', description: 'Verify audit logging is comprehensive', recommendation: 'Ensure all security-relevant actions are logged and monitored.' },
    );
  }

  return JSON.stringify({
    score,
    issues,
    summary: `AI compliance analysis unavailable. Basic checklist generated from available data. Score: ${score}/100 based on ${unresolvedVulns} vulnerabilities, ${exposedSecrets} exposed secrets, and ${highRiskActions} high-risk actions.`,
  });
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ruleType = searchParams.get('ruleType');
    const isEnabled = searchParams.get('isEnabled');

    const where: Record<string, unknown> = {};
    if (ruleType) where.ruleType = ruleType;
    if (isEnabled !== null) where.isEnabled = isEnabled === 'true';

    const policies = await db.compliancePolicy.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(policies);
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

    // If the request is for compliance analysis (has "framework" field), run AI analysis
    if (body.framework !== undefined) {
      const { framework, projectPath } = body;

      const vulnerabilities = await db.securityVulnerability.findMany({
        where: projectPath ? { filePath: { startsWith: projectPath } } : {},
      });

      const exposedSecrets = await db.exposedSecret.findMany({
        where: { isRevoked: false },
      });

      const auditLogs = await db.auditLog.findMany({
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
    }

    // Otherwise, create a CompliancePolicy
    const { name, description, ruleType, config, severity, isEnabled } = body as {
      name: string;
      description: string;
      ruleType: string;
      config?: Record<string, unknown> | string;
      severity?: string;
      isEnabled?: boolean;
    };

    if (!name || !description || !ruleType) {
      return NextResponse.json(
        { error: 'name, description, and ruleType are required' },
        { status: 400 }
      );
    }

    const policy = await db.compliancePolicy.create({
      data: {
        name,
        description,
        ruleType,
        config: typeof config === 'string' ? config : JSON.stringify(config || {}),
        severity: severity || 'medium',
        isEnabled: isEnabled ?? true,
      },
    });

    return NextResponse.json(policy, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
