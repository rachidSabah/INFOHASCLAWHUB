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
        { role: 'system', content: 'You are a code analysis expert. Analyze the provided code and extract symbols (functions, classes, variables, imports, exports). Return a JSON array of objects with: symbolName, symbolType, lineStart, lineEnd, content (snippet).' },
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
    const { projectPath, files } = body;

    if (!projectPath) {
      return NextResponse.json({ error: 'projectPath is required' }, { status: 400 });
    }

    const indexedSymbols = [];

    if (files && Array.isArray(files)) {
      for (const file of files) {
        const aiResult = await callAI(
          `Analyze this file from project "${projectPath}":\nFile: ${file.path}\nContent:\n${file.content}\n\nExtract all symbols as a JSON array.`
        );

        let symbols;
        try {
          symbols = JSON.parse(aiResult);
        } catch {
          symbols = [];
        }

        for (const symbol of symbols) {
          const indexEntry = await db.codeIndex.create({
            data: {
              projectPath,
              filePath: file.path,
              symbolName: symbol.symbolName || 'unknown',
              symbolType: symbol.symbolType || 'variable',
              lineStart: symbol.lineStart || 1,
              lineEnd: symbol.lineEnd,
              content: symbol.content,
            },
          });
          indexedSymbols.push(indexEntry);
        }
      }
    }

    return NextResponse.json({ indexed: indexedSymbols.length, symbols: indexedSymbols });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
