import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

import ZAI from 'z-ai-web-dev-sdk';



async function callAI(prompt: string) {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are an AI assistant that executes quick actions. Return a JSON object with: "result" (the action result), "message" (human-readable summary), and "data" (any relevant data).' },
      { role: 'user', content: prompt }
    ],
  });
  return completion.choices[0]?.message?.content || '{}';
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
