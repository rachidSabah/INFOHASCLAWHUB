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
        { role: 'system', content: 'You are an AI assistant that executes quick actions. Return a JSON object with: "result" (the action result), "message" (human-readable summary), and "data" (any relevant data).' },
        { role: 'user', content: prompt }
      ],
    });
    return completion.choices[0]?.message?.content || '{}';
  } catch (error) {
    console.error('ZAI SDK error:', error);
    return '{}';
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, params, context } = body;

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }

    const aiResult = await callAI(
      `Execute this quick action:\n\nAction: ${action}\nParameters: ${JSON.stringify(params || {})}\n${context ? `Context: ${JSON.stringify(context)}` : ''}\n\nReturn the result as JSON.`
    );

    let result;
    try {
      result = JSON.parse(aiResult);
    } catch {
      result = { result: 'completed', message: aiResult, data: null };
    }

    // Log as an analytics event
    await db.analyticsEvent.create({
      data: {
        eventType: 'code_gen',
        metadata: JSON.stringify({ action, params }),
        success: true,
      },
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
