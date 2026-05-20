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



async function callAI(prompt: string): Promise<string> {
  try {
    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a git analysis expert. Analyze commits and PRs for risk, patterns, and suggestions. Return a JSON object with: "summary", "risk" (low|medium|high), "suggestions" (array of strings), and "patterns" (array of strings).' },
        { role: 'user', content: prompt }
      ],
    });
    const result = completion.choices[0]?.message?.content;
    if (result && result.trim() && result.trim() !== '{}') return result;
    // If AI returned empty, fall through to smart fallback
  } catch (error) {
    console.error('[GitAnalyze] ZAI SDK error:', error);
    // Fall through to smart fallback
  }
  return generateGitAnalyzeFallback(prompt);
}

function generateGitAnalyzeFallback(prompt: string): string {
  // Determine risk level from prompt content
  let risk: 'low' | 'medium' | 'high' = 'medium';
  const lower = prompt.toLowerCase();
  if (lower.includes('delete') || lower.includes('drop') || lower.includes('remove') || lower.includes('force')) {
    risk = 'high';
  } else if (lower.includes('fix') || lower.includes('update') || lower.includes('patch') || lower.includes('config')) {
    risk = 'low';
  }

  return JSON.stringify({
    summary: 'AI analysis unavailable — manual review recommended. Please inspect the changes carefully before proceeding.',
    risk,
    suggestions: [
      'Review changes manually line by line',
      'Run local tests before committing',
      'Check for unintended side effects',
      'Verify no sensitive data is exposed in the diff',
    ],
    patterns: [],
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectPath, commitHash, diff, type } = body;

    if (!projectPath || !commitHash) {
      return NextResponse.json({ error: 'projectPath and commitHash are required' }, { status: 400 });
    }

    const aiResult = await callAI(
      `Analyze this git ${type || 'commit'}:\n\nProject: ${projectPath}\nCommit: ${commitHash}\n${diff ? `Diff:\n${diff}` : ''}\n\nProvide analysis as JSON with summary, risk, suggestions, and patterns.`
    );

    let analysis;
    try {
      analysis = JSON.parse(aiResult);
    } catch {
      analysis = { summary: aiResult, risk: 'low', suggestions: [], patterns: [] };
    }

    const gitAnalysis = await (db as any).gitAnalysis.create({
      data: {
        projectPath,
        commitHash,
        analysis: JSON.stringify(analysis),
        type: type || 'commit',
      },
    });

    return NextResponse.json(gitAnalysis);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
