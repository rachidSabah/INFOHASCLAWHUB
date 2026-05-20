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
        { role: 'system', content: 'You are a UI component generator. Generate clean, production-ready component code based on the description. Return the code as a string.' },
        { role: 'user', content: prompt }
      ],
    });
    const result = completion.choices[0]?.message?.content;
    if (result && result.trim()) return result;
    // If AI returned empty, fall through to smart fallback
  } catch (aiError: unknown) {
    const errMsg = aiError instanceof Error ? aiError.message : 'AI generation failed';
    console.error('[UI Builder] AI call failed:', errMsg);
    // Fall through to smart fallback
  }
  return generateUIFallback(prompt);
}

function generateUIFallback(prompt: string): string {
  // Extract description from the prompt
  const descMatch = prompt.match(/Generate a\s+\w+\s+component for the following description:\n\n([\s\S]*?)\n\nReturn only/);
  const description = descMatch ? descMatch[1].trim() : 'Custom Component';
  const componentName = description
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 3)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('') || 'Generated';

  return `// AI generation fallback - component created from description
import React from 'react';

export default function ${componentName}Component() {
  return (
    <div className="p-6 border border-border rounded-lg bg-card">
      <h2 className="text-lg font-semibold text-card-foreground mb-2">${description.substring(0, 80)}</h2>
      <p className="text-muted-foreground text-sm">
        AI component generation unavailable. This is a placeholder component.
        Customize it to match your requirements.
      </p>
    </div>
  );
}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { description, framework, projectId } = body;

    if (!description) {
      return NextResponse.json({ error: 'description is required' }, { status: 400 });
    }

    const targetFramework = framework || 'react';

    const generatedCode = await callAI(
      `Generate a ${targetFramework} component for the following description:\n\n${description}\n\nReturn only the component code, no explanations.`
    );

    if (projectId) {
      try {
        await (db as any).uiBuilderProject.update({
          where: { id: projectId },
          data: { generatedCode },
        });
      } catch (dbError: unknown) {
        console.error('[UI Builder] Failed to update project:', dbError instanceof Error ? dbError.message : 'Unknown DB error');
        // Don't fail the whole request if DB update fails
      }
    }

    return NextResponse.json({ generatedCode, framework: targetFramework });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate UI component';
    console.error('[UI Builder] Generate error:', errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
