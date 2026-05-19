import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

import ZAI from 'z-ai-web-dev-sdk';



async function callAI(prompt: string) {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a UI component generator. Generate clean, production-ready component code based on the description. Return the code as a string.' },
      { role: 'user', content: prompt }
    ],
  });
  return completion.choices[0]?.message?.content || '';
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
