import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

import ZAI from 'z-ai-web-dev-sdk';



async function callAI(prompt: string) {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a communication assistant. Adapt the given message for different platforms while maintaining the core message.' },
      { role: 'user', content: prompt }
    ],
  });
  return completion.choices[0]?.message?.content || '';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, platforms, adaptPerPlatform } = body;

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const where: any = { isConnected: true, botEnabled: true };
    if (platforms && Array.isArray(platforms)) {
      where.platform = { in: platforms };
    }

    const connections = await db.botConnection.findMany({ where });

    const results = [];
    for (const connection of connections) {
      let adaptedMessage = message;

      if (adaptPerPlatform && connection.personality) {
        try {
          const personality = JSON.parse(connection.personality);
          adaptedMessage = await callAI(
            `Adapt this message for ${connection.platform} (tone: ${personality.tone || 'professional'}, style: ${personality.style || 'casual'}):\n\n${message}`
          );
        } catch {
          adaptedMessage = message;
        }
      }

      results.push({
        platform: connection.platform,
        name: connection.name,
        message: adaptedMessage,
        sent: true,
        timestamp: new Date().toISOString(),
      });

      await db.botConnection.update({
        where: { id: connection.id },
        data: { lastActivity: new Date() },
      });
    }

    return NextResponse.json({ broadcast: true, recipients: results.length, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
