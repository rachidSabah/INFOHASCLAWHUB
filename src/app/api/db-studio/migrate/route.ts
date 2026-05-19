import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

import ZAI from 'z-ai-web-dev-sdk';



async function callAI(prompt: string) {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are a database migration expert. Generate safe, reversible migration SQL. Return a JSON object with "up" (migration SQL), "down" (rollback SQL), and "description" fields.' },
      { role: 'user', content: prompt }
    ],
  });
  return completion.choices[0]?.message?.content || '{}';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { connectionId, description, currentSchema, targetChanges } = body;

    if (!description && !targetChanges) {
      return NextResponse.json({ error: 'description or targetChanges is required' }, { status: 400 });
    }

    let schemaContext = '';
    if (connectionId) {
      const connection = await db.databaseConnection.findUnique({ where: { id: connectionId } });
      if (connection?.schemaSnapshot) {
        schemaContext = `\nCurrent schema:\n${connection.schemaSnapshot}`;
      }
    } else if (currentSchema) {
      schemaContext = `\nCurrent schema:\n${JSON.stringify(currentSchema)}`;
    }

    const changeDescription = targetChanges ? JSON.stringify(targetChanges) : description;

    const aiResult = await callAI(
      `Generate a database migration:${schemaContext}\n\nRequested changes: ${changeDescription}\n\nReturn a JSON object with "up" (migration SQL), "down" (rollback SQL), and "description" fields.`
    );

    let result;
    try {
      result = JSON.parse(aiResult);
    } catch {
      result = { up: aiResult, down: '', description: 'AI-generated migration' };
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
