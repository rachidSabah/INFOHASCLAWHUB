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
        { role: 'system', content: 'You are a UI code generator. Given a description of a screenshot or UI layout, generate the corresponding component code. Return only the code.' },
        { role: 'user', content: prompt }
      ],
    });
    const result = completion.choices[0]?.message?.content;
    if (result && result.trim()) return result;
    // If AI returned empty, fall through to smart fallback
  } catch (error) {
    console.error('[UIScreen] ZAI SDK error:', error);
    // Fall through to smart fallback
  }
  return generateScreenshotFallback(prompt);
}

function generateScreenshotFallback(prompt: string): string {
  // Extract description from the prompt
  const descMatch = prompt.match(/Convert this screenshot\/UI description to\s+\w+\s+code:\n\n([\s\S]*?)\n\nReturn production-ready/);
  const description = descMatch ? descMatch[1].trim() : 'UI Layout';
  const componentName = description
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 3)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('') || 'Screenshot';

  return `// AI screenshot conversion fallback - placeholder component
import React from 'react';

export default function ${componentName}Layout() {
  return (
    <div className="min-h-screen bg-background p-6">
      <header className="border-b border-border pb-4 mb-6">
        <h1 className="text-2xl font-bold text-foreground">${description.substring(0, 60)}</h1>
        <p className="text-muted-foreground text-sm mt-1">Screenshot-to-code conversion unavailable. Use this as a starting layout.</p>
      </header>
      <main className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="h-32 bg-muted rounded mb-3" />
          <h3 className="font-medium text-card-foreground">Section 1</h3>
          <p className="text-sm text-muted-foreground mt-1">Placeholder content</p>
        </div>
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="h-32 bg-muted rounded mb-3" />
          <h3 className="font-medium text-card-foreground">Section 2</h3>
          <p className="text-sm text-muted-foreground mt-1">Placeholder content</p>
        </div>
        <div className="border border-border rounded-lg p-4 bg-card">
          <div className="h-32 bg-muted rounded mb-3" />
          <h3 className="font-medium text-card-foreground">Section 3</h3>
          <p className="text-sm text-muted-foreground mt-1">Placeholder content</p>
        </div>
      </main>
    </div>
  );
}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { screenshotDescription, framework, projectId } = body;

    if (!screenshotDescription) {
      return NextResponse.json({ error: 'screenshotDescription is required' }, { status: 400 });
    }

    const targetFramework = framework || 'react';

    const generatedCode = await callAI(
      `Convert this screenshot/UI description to ${targetFramework} code:\n\n${screenshotDescription}\n\nReturn production-ready component code with proper styling.`
    );

    if (projectId) {
      await (db as any).uiBuilderProject.update({
        where: { id: projectId },
        data: { generatedCode },
      });
    }

    return NextResponse.json({ generatedCode, framework: targetFramework });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
