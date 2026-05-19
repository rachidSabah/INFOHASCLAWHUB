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
        { role: 'system', content: 'You are a voice coding assistant. Convert voice commands to code actions. Return a JSON object with: "action" (the detected action type), "code" (any generated code), "command" (the interpreted command), and "explanation".' },
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
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
