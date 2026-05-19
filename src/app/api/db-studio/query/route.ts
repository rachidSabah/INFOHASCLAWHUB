import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

import ZAI from 'z-ai-web-dev-sdk';



async function callAI(prompt: string) {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a database expert. Convert natural language queries to SQL. Return a JSON object with "sql" and "explanation" fields.' },
      { role: 'user', content: prompt }
    ],
  });
  return completion.choices[0]?.message?.content || '{}';
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
