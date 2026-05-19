import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

import ZAI from 'z-ai-web-dev-sdk';



async function callAI(prompt: string) {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a code analysis expert. Analyze the provided code and extract symbols (functions, classes, variables, imports, exports). Return a JSON array of objects with: symbolName, symbolType, lineStart, lineEnd, content (snippet).' },
      { role: 'user', content: prompt }
    ],
  });
  return completion.choices[0]?.message?.content || '[]';
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
