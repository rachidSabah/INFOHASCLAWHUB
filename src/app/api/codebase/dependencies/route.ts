import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectPath = searchParams.get('projectPath');

    if (!projectPath) {
      return NextResponse.json({ error: 'projectPath query parameter is required' }, { status: 400 });
    }

    const symbols = await db.codeIndex.findMany({
      where: { projectPath },
    });

    // Build a simple dependency graph from imports/exports
    const files = [...new Set(symbols.map(s => s.filePath))];
    const imports = symbols.filter(s => s.symbolType === 'import');
    const exports_ = symbols.filter(s => s.symbolType === 'export');

    const graph: Record<string, { imports: string[]; exports: string[] }> = {};
    for (const file of files) {
      graph[file] = {
        imports: imports
          .filter(s => s.filePath === file)
          .map(s => s.symbolName),
        exports: exports_
          .filter(s => s.filePath === file)
          .map(s => s.symbolName),
      };
    }

    return NextResponse.json({ projectPath, files: files.length, graph });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
