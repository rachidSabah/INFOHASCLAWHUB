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
        { role: 'system', content: 'You are a code search expert. Given a search query and code symbols, return the most relevant matches ranked by relevance. Return a JSON array of objects with: symbolName, filePath, symbolType, relevanceScore (0-1), reason.' },
        { role: 'user', content: prompt }
      ],
    });
    return completion.choices[0]?.message?.content || '[]';
  } catch (error) {
    console.error('ZAI SDK error:', error);
    return '[]';
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, projectPath, limit } = body;

    if (!query) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    // Get all indexed symbols for the project
    const where: any = {};
    if (projectPath) where.projectPath = projectPath;

    const symbols = await db.codeIndex.findMany({ where });

    if (symbols.length === 0) {
      return NextResponse.json({ results: [], message: 'No indexed symbols found. Index a project first.' });
    }

    // Use AI to rank results by semantic relevance
    const symbolsSummary = symbols.slice(0, 100).map(s =>
      `${s.symbolName} (${s.symbolType}) in ${s.filePath}:${s.lineStart}`
    ).join('\n');

    const aiResult = await callAI(
      `Search query: "${query}"\n\nAvailable symbols:\n${symbolsSummary}\n\nReturn the most relevant matches as a JSON array.`
    );

    let rankedResults;
    try {
      rankedResults = JSON.parse(aiResult);
    } catch {
      rankedResults = [];
    }

    // Merge with actual DB data
    const results = rankedResults.slice(0, limit || 20).map((r: any) => {
      const match = symbols.find(s => s.symbolName === r.symbolName && s.filePath === r.filePath);
      return {
        ...r,
        lineStart: match?.lineStart,
        lineEnd: match?.lineEnd,
        content: match?.content,
      };
    });

    return NextResponse.json({ results });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
