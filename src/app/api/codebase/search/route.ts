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
        { role: 'system', content: 'You are a code search expert. Given a search query and code symbols, return the most relevant matches ranked by relevance. Return a JSON array of objects with: symbolName, filePath, symbolType, relevanceScore (0-1), reason.' },
        { role: 'user', content: prompt }
      ],
    });
    const result = completion.choices[0]?.message?.content;
    if (result && result.trim() && result.trim() !== '[]') return result;
    // If AI returned empty, fall through to smart fallback
  } catch (error) {
    console.error('[CodebaseSearch] ZAI SDK error:', error);
    // Fall through to smart fallback
  }
  return generateSearchFallback(prompt);
}

function generateSearchFallback(prompt: string): string {
  // Extract the query and symbols from the prompt
  const queryMatch = prompt.match(/Search query:\s*"([^"]+)"/);
  const query = queryMatch ? queryMatch[1].toLowerCase() : '';
  const symbolsMatch = prompt.match(/Available symbols:\n([\s\S]*?)$/);
  const symbolsText = symbolsMatch ? symbolsMatch[1] : '';

  const results: Array<{ symbolName: string; filePath: string; symbolType: string; relevanceScore: number; reason: string }> = [];

  if (symbolsText && query) {
    // Simple text-based matching of symbols against query terms
    const queryTerms = query.split(/\s+/);
    const symbolLines = symbolsText.split('\n').filter(l => l.trim());

    for (const line of symbolLines) {
      const lineLower = line.toLowerCase();
      const matchedTerms = queryTerms.filter(term => lineLower.includes(term));
      if (matchedTerms.length > 0) {
        const parseMatch = line.match(/(\w+)\s*\((\w+)\)\s*in\s*([^:]+):(\d+)/);
        if (parseMatch) {
          results.push({
            symbolName: parseMatch[1],
            filePath: parseMatch[3],
            symbolType: parseMatch[2],
            relevanceScore: matchedTerms.length / queryTerms.length,
            reason: `Matched terms: ${matchedTerms.join(', ')} (AI ranking unavailable)`,
          });
        }
      }
    }
  }

  return JSON.stringify(results);
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

    const symbols = await (db as any).codeIndex.findMany({ where });

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
