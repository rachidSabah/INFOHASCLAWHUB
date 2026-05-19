import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

import ZAI from 'z-ai-web-dev-sdk';



async function callAI(prompt: string) {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are an expert software architect. Generate a detailed step-by-step plan for the given coding task. Return the plan as a JSON object with a "steps" array of strings.' },
      { role: 'user', content: prompt }
    ],
  });
  return completion.choices[0]?.message?.content || '';
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
