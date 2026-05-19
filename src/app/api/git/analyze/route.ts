import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

import ZAI from 'z-ai-web-dev-sdk';



async function callAI(prompt: string) {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a git analysis expert. Analyze commits and PRs for risk, patterns, and suggestions. Return a JSON object with: "summary", "risk" (low|medium|high), "suggestions" (array of strings), and "patterns" (array of strings).' },
      { role: 'user', content: prompt }
    ],
  });
  return completion.choices[0]?.message?.content || '{}';
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

    const gitAnalysis = await db.gitAnalysis.create({
      data: {
        projectPath,
        commitHash,
        analysis: JSON.stringify(analysis),
        type: type || 'commit',
      },
    });

    return NextResponse.json(gitAnalysis);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
