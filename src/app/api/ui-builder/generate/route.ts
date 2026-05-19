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
    return completion.choices[0]?.message?.content || '';
  } catch (aiError: unknown) {
    const errMsg = aiError instanceof Error ? aiError.message : 'AI generation failed';
    console.error('[UI Builder] AI call failed:', errMsg);
    // Return a fallback template instead of crashing
    return `// AI generation fallback - ${errMsg}\nexport default function GeneratedComponent() {\n  return <div className="p-4 border rounded">Component placeholder</div>;\n}`;
  }
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
        await db.uIBuilderProject.update({
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
