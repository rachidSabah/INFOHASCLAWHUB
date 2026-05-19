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
        { role: 'system', content: 'You are a database expert. Convert natural language queries to SQL. Return a JSON object with "sql" and "explanation" fields.' },
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
    const { query, connectionId, dialect } = body;

    if (!query) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    let schemaContext = '';
    if (connectionId) {
      const connection = await db.databaseConnection.findUnique({ where: { id: connectionId } });
      if (connection?.schemaSnapshot) {
        schemaContext = `\n\nDatabase schema:\n${connection.schemaSnapshot}`;
      }
    }

    const aiResult = await callAI(
      `Convert this natural language query to ${dialect || 'SQL'}:${schemaContext}\n\nQuery: ${query}\n\nReturn a JSON object with "sql" and "explanation" fields.`
    );

    let result;
    try {
      result = JSON.parse(aiResult);
    } catch {
      result = { sql: aiResult, explanation: 'Generated SQL query' };
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
