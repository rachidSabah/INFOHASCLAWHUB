import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';




export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectPath = searchParams.get('projectPath');

    // If no projectPath, return all indexed symbols
    const where: Record<string, any> = {};
    if (projectPath) where.projectPath = projectPath;

    const symbols = await (db as any).codeIndex.findMany({ where });

    // Build a simple dependency graph from imports/exports
    const files = Array.from(new Set<string>(symbols.map((s: any) => s.filePath as string)));
    const imports = symbols.filter((s: any) => s.symbolType === 'import');
    const exports_ = symbols.filter((s: any) => s.symbolType === 'export');

    const graph: Record<string, { imports: string[]; exports: string[] }> = {};
    for (const file of files) {
      graph[file] = {
        imports: imports
          .filter((s: any) => s.filePath === file)
          .map((s: any) => s.symbolName),
        exports: exports_
          .filter((s: any) => s.filePath === file)
          .map((s: any) => s.symbolName),
      };
    }

    return NextResponse.json({ projectPath: projectPath || "all", files: files.length, graph });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
