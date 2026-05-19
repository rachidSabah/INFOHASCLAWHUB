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
        { role: 'system', content: 'You are a UI code generator. Given a description of a screenshot or UI layout, generate the corresponding component code. Return only the code.' },
        { role: 'user', content: prompt }
      ],
    });
    return completion.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('ZAI SDK error:', error);
    return '';
  }
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
      await db.uIBuilderProject.update({
        where: { id: projectId },
        data: { generatedCode },
      });
    }

    return NextResponse.json({ generatedCode, framework: targetFramework });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
