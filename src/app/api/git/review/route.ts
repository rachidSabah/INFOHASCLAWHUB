import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

import ZAI from 'z-ai-web-dev-sdk';



async function callAI(prompt: string) {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a senior code reviewer. Review the code changes and provide detailed feedback. Return a JSON object with: "approved" (boolean), "score" (0-100), "issues" (array of { file, line, severity, message }), "positives" (array of strings), and "suggestions" (array of strings).' },
      { role: 'user', content: prompt }
    ],
  });
  return completion.choices[0]?.message?.content || '{}';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectPath, diff, files, description } = body;

    if (!diff && !files) {
      return NextResponse.json({ error: 'diff or files is required' }, { status: 400 });
    }

    const contextStr = diff
      ? `Diff:\n${diff}`
      : `Files:\n${files.map((f: any) => `${f.path}:\n${f.content}`).join('\n\n')}`;

    const aiResult = await callAI(
      `Review this code change:\n\nProject: ${projectPath || 'unknown'}\n${description ? `Description: ${description}\n` : ''}${contextStr}\n\nProvide a thorough code review as JSON.`
    );

    let review;
    try {
      review = JSON.parse(aiResult);
    } catch {
      review = { approved: true, score: 70, issues: [], positives: [], suggestions: [aiResult] };
    }

    // Store as a git analysis of type "review"
    const gitAnalysis = await db.gitAnalysis.create({
      data: {
        projectPath: projectPath || 'unknown',
        commitHash: `review-${Date.now()}`,
        analysis: JSON.stringify(review),
        type: 'review',
      },
    });

    return NextResponse.json({ review, analysisId: gitAnalysis.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
