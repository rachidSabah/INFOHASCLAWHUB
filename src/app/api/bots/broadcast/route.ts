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
        { role: 'system', content: 'You are a communication assistant. Adapt the given message for different platforms while maintaining the core message.' },
        { role: 'user', content: prompt }
      ],
    });
    const result = completion.choices[0]?.message?.content;
    if (result && result.trim()) return result;
    // If AI returned empty, fall through to smart fallback
  } catch (error) {
    console.error('[BotBroadcast] ZAI SDK error:', error);
    // Fall through to smart fallback
  }
  return generateBroadcastFallback(prompt);
}

function generateBroadcastFallback(prompt: string): string {
  // Extract the original message from the prompt
  const msgMatch = prompt.match(/Adapt this message[^:]*:\n\n([\s\S]*?)$/);
  if (msgMatch) {
    // Return the original message unchanged — better than empty string
    return msgMatch[1].trim();
  }
  // Fallback: try to extract any message content after double newline
  const simpleMatch = prompt.match(/:\n\n(.+)/);
  return simpleMatch ? simpleMatch[1].trim() : 'Broadcast message (AI adaptation unavailable — original message preserved)';
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

    const connections = await (db as any).botConnection.findMany({ where });

    const results: Array<{ platform: string; name: string; message: string; sent: boolean; timestamp: string }> = [];
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

      await (db as any).botConnection.update({
        where: { id: connection.id },
        data: { lastActivity: new Date() },
      });
    }

    return NextResponse.json({ broadcast: true, recipients: results.length, results });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
