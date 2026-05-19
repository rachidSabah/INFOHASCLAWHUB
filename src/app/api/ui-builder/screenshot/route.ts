import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

import ZAI from 'z-ai-web-dev-sdk';



async function callAI(prompt: string) {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a UI code generator. Given a description of a screenshot or UI layout, generate the corresponding component code. Return only the code.' },
      { role: 'user', content: prompt }
    ],
  });
  return completion.choices[0]?.message?.content || '';
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
