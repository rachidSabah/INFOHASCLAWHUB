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
        { role: 'system', content: 'You are a git merge conflict resolution expert. Analyze the conflict and provide a resolution that combines both sides intelligently. Return a JSON object with: "resolvedCode" (the merged code), "strategy" (how the merge was done), and "explanation".' },
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
    const { projectPath, filePath, ours, theirs, base } = body;

    if (!filePath || !ours || !theirs) {
      return NextResponse.json({ error: 'filePath, ours, and theirs are required' }, { status: 400 });
    }

    const aiResult = await callAI(
      `Resolve this merge conflict:\n\nFile: ${filePath}\n${base ? `Base version:\n${base}\n` : ''}Our version:\n${ours}\n\nTheir version:\n${theirs}\n\nProvide a merged resolution as JSON with resolvedCode, strategy, and explanation.`
    );

    let resolution;
    try {
      resolution = JSON.parse(aiResult);
    } catch {
      resolution = { resolvedCode: aiResult, strategy: 'ai-assisted', explanation: 'AI-generated merge resolution' };
    }

    const gitAnalysis = await db.gitAnalysis.create({
      data: {
        projectPath: projectPath || 'unknown',
        commitHash: `conflict-${Date.now()}`,
        analysis: JSON.stringify(resolution),
        type: 'conflict',
      },
    });

    return NextResponse.json({ resolution, analysisId: gitAnalysis.id });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
