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
        { role: 'system', content: 'You are an expert software architect. Generate a detailed step-by-step plan for the given coding task. Return the plan as a JSON object with a "steps" array of strings.' },
        { role: 'user', content: prompt }
      ],
    });
    return completion.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('ZAI SDK error:', error);
    return '';
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await db.codingSession.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json({ error: 'Coding session not found' }, { status: 404 });
    }

    const aiResult = await callAI(
      `Create a step-by-step plan for this coding task:\n\nWorkspace: ${session.workspacePath}\nTask: ${session.task}\n\nReturn a JSON object with "steps" as a string array.`
    );

    let plan;
    try {
      plan = JSON.parse(aiResult);
    } catch {
      plan = { steps: aiResult.split('\n').filter((s: string) => s.trim()) };
    }

    const updated = await db.codingSession.update({
      where: { id },
      data: {
        status: 'planning',
        plan: JSON.stringify(plan),
      },
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
