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
        { role: 'system', content: 'You are a git merge conflict resolution expert. Analyze the conflict and provide a resolution that combines both sides intelligently. Return a JSON object with: "resolvedCode" (the merged code), "strategy" (how the merge was done), and "explanation".' },
        { role: 'user', content: prompt }
      ],
    });
    const result = completion.choices[0]?.message?.content;
    if (result && result.trim() && result.trim() !== '{}') return result;
    // If AI returned empty, fall through to smart fallback
  } catch (error) {
    console.error('[GitConflict] ZAI SDK error:', error);
    // Fall through to smart fallback
  }
  return generateConflictFallback(prompt);
}

function generateConflictFallback(prompt: string): string {
  // Extract ours and theirs from the prompt
  const oursMatch = prompt.match(/Our version:\n([\s\S]*?)(?=\n\nTheir version:)/);
  const theirsMatch = prompt.match(/Their version:\n([\s\S]*?)$/);
  const filePathMatch = prompt.match(/File:\s*(.+)/);
  const filePath = filePathMatch ? filePathMatch[1].trim() : 'unknown';

  const ours = oursMatch ? oursMatch[1].trim() : '';
  const theirs = theirsMatch ? theirsMatch[1].trim() : '';

  // Strategy: if one side is empty, use the non-empty side; otherwise use ours with a note
  let resolvedCode: string;
  let strategy: string;
  let explanation: string;

  if (!ours && theirs) {
    resolvedCode = theirs;
    strategy = 'theirs-only';
    explanation = `No content in "ours" branch for ${filePath}. Kept "theirs" version unchanged.`;
  } else if (ours && !theirs) {
    resolvedCode = ours;
    strategy = 'ours-only';
    explanation = `No content in "theirs" branch for ${filePath}. Kept "ours" version unchanged.`;
  } else {
    resolvedCode = ours || theirs;
    strategy = 'ours-priority';
    explanation = `AI conflict resolution unavailable for ${filePath}. Kept "ours" version as base. Please manually review and merge changes from both sides. Look for additions in "theirs" that should be preserved.`;
  }

  return JSON.stringify({ resolvedCode, strategy, explanation });
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

    const gitAnalysis = await (db as any).gitAnalysis.create({
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
