import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

import ZAI from 'z-ai-web-dev-sdk';



async function callAI(prompt: string) {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a helpful bot assistant. Generate an appropriate response for the given message context.' },
      { role: 'user', content: prompt }
    ],
  });
  return completion.choices[0]?.message?.content || '';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { message, useAI } = body;

    const connection = await db.botConnection.findUnique({ where: { id } });
    if (!connection) {
      return NextResponse.json({ error: 'Bot connection not found' }, { status: 404 });
    }
    if (!connection.isConnected) {
      return NextResponse.json({ error: 'Bot is not connected' }, { status: 400 });
    }

    let responseMessage = message;

    if (useAI && message) {
      const personality = connection.personality ? JSON.parse(connection.personality) : {};
      const systemContext = personality.tone
        ? `Respond in a ${personality.tone} tone. Style: ${personality.style || 'professional'}.`
        : '';
      responseMessage = await callAI(`${systemContext}\n\nUser message: ${message}`);
    }

    await db.botConnection.update({
      where: { id },
      data: { lastActivity: new Date() },
    });

    return NextResponse.json({
      success: true,
      platform: connection.platform,
      message: responseMessage,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
