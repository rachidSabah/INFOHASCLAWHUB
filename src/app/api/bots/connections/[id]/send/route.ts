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



async function callAI(prompt: string): Promise<string> {
  try {
    const zai = await getZAI();
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'system', content: 'You are a helpful bot assistant. Generate an appropriate response for the given message context.' },
        { role: 'user', content: prompt }
      ],
    });
    const result = completion.choices[0]?.message?.content;
    if (result && result.trim()) return result;
    // If AI returned empty, fall through to smart fallback
  } catch (error) {
    console.error('[BotSend] ZAI SDK error:', error);
    // Fall through to smart fallback
  }
  return generateBotSendFallback(prompt);
}

function generateBotSendFallback(prompt: string): string {
  // Extract the user message from the prompt
  const msgMatch = prompt.match(/User message:\s*(.+)/);
  const userMessage = msgMatch ? msgMatch[1].trim() : '';

  // Generate a polite auto-reply acknowledging the message
  if (userMessage) {
    return `Thank you for your message. I'm currently operating with limited AI capabilities, but your message has been received. A team member will follow up with you shortly.`;
  }

  return `Hello! I'm currently operating with limited AI capabilities. Your message has been logged and will be addressed as soon as possible.`;
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
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
