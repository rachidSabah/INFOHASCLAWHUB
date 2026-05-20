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
        { role: 'system', content: 'You are a code analysis expert. Analyze the provided code and extract symbols (functions, classes, variables, imports, exports). Return a JSON array of objects with: symbolName, symbolType, lineStart, lineEnd, content (snippet).' },
        { role: 'user', content: prompt }
      ],
    });
    const result = completion.choices[0]?.message?.content;
    if (result && result.trim() && result.trim() !== '[]') return result;
    // If AI returned empty, fall through to smart fallback
  } catch (error) {
    console.error('[CodebaseIndex] ZAI SDK error:', error);
    // Fall through to smart fallback
  }
  return generateIndexFallback(prompt);
}

function generateIndexFallback(prompt: string): string {
  // Extract file path and content from the prompt
  const filePathMatch = prompt.match(/File:\s*(.+)/);
  const contentMatch = prompt.match(/Content:\n([\s\S]*?)$/);
  const filePath = filePathMatch ? filePathMatch[1].trim() : 'unknown';
  const content = contentMatch ? contentMatch[1] : '';

  const symbols: Array<{ symbolName: string; symbolType: string; lineStart: number; lineEnd?: number; content?: string }> = [];

  if (content) {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Function declarations
      const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
      if (funcMatch) {
        symbols.push({
          symbolName: funcMatch[1],
          symbolType: 'function',
          lineStart: i + 1,
          content: line.trim().substring(0, 100),
        });
        continue;
      }

      // Arrow functions / const declarations
      const arrowMatch = line.match(/(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/);
      if (arrowMatch) {
        symbols.push({
          symbolName: arrowMatch[1],
          symbolType: 'function',
          lineStart: i + 1,
          content: line.trim().substring(0, 100),
        });
        continue;
      }

      // Class declarations
      const classMatch = line.match(/(?:export\s+)?(?:default\s+)?class\s+(\w+)/);
      if (classMatch) {
        symbols.push({
          symbolName: classMatch[1],
          symbolType: 'class',
          lineStart: i + 1,
          content: line.trim().substring(0, 100),
        });
        continue;
      }

      // Interface declarations
      const interfaceMatch = line.match(/(?:export\s+)?interface\s+(\w+)/);
      if (interfaceMatch) {
        symbols.push({
          symbolName: interfaceMatch[1],
          symbolType: 'interface',
          lineStart: i + 1,
          content: line.trim().substring(0, 100),
        });
        continue;
      }

      // Type declarations
      const typeMatch = line.match(/(?:export\s+)?type\s+(\w+)/);
      if (typeMatch) {
        symbols.push({
          symbolName: typeMatch[1],
          symbolType: 'type',
          lineStart: i + 1,
          content: line.trim().substring(0, 100),
        });
        continue;
      }

      // Variable declarations
      const varMatch = line.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)/);
      if (varMatch) {
        symbols.push({
          symbolName: varMatch[1],
          symbolType: 'variable',
          lineStart: i + 1,
          content: line.trim().substring(0, 100),
        });
      }
    }
  }

  return JSON.stringify(symbols);
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
