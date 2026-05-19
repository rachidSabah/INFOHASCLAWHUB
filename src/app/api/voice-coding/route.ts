import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

import ZAI from 'z-ai-web-dev-sdk';



async function callAI(prompt: string) {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a voice coding assistant. Convert voice commands to code actions. Return a JSON object with: "action" (the detected action type), "code" (any generated code), "command" (the interpreted command), and "explanation".' },
      { role: 'user', content: prompt }
    ],
  });
  return completion.choices[0]?.message?.content || '{}';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transcript, language, context } = body;

    if (!transcript) {
      return NextResponse.json({ error: 'transcript is required' }, { status: 400 });
    }

    const aiResult = await callAI(
      `Process this voice coding command:\n\nTranscript: "${transcript}"\nLanguage: ${language || 'typescript'}\n${context ? `Code context:\n${context}` : ''}\n\nInterpret the command and generate appropriate code or action as JSON.`
    );

    let result;
    try {
      result = JSON.parse(aiResult);
    } catch {
      result = { action: 'unknown', code: '', command: transcript, explanation: aiResult };
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
