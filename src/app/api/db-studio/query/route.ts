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
        { role: 'system', content: 'You are a database expert. Convert natural language queries to SQL. Return a JSON object with "sql" and "explanation" fields.' },
        { role: 'user', content: prompt }
      ],
    });
    const result = completion.choices[0]?.message?.content;
    if (result && result.trim() && result.trim() !== '{}') return result;
    // If AI returned empty, fall through to smart fallback
  } catch (error) {
    console.error('[DBQuery] ZAI SDK error:', error);
    // Fall through to smart fallback
  }
  return generateQueryFallback(prompt);
}

function generateQueryFallback(prompt: string): string {
  // Extract the query from the prompt
  const queryMatch = prompt.match(/Query:\s*(.+)/);
  const query = queryMatch ? queryMatch[1].trim() : '';
  const lower = query.toLowerCase();

  // Basic keyword-to-SQL mapping for common patterns
  if (lower.includes('select') || lower.includes('show') || lower.includes('get') || lower.includes('list') || lower.includes('find')) {
    const tableMatch = lower.match(/(?:from|in|of)\s+(?:the\s+)?(\w+)/);
    const table = tableMatch ? tableMatch[1] : 'table_name';
    return JSON.stringify({
      sql: `SELECT * FROM ${table} LIMIT 100;`,
      explanation: `AI unavailable — generated a basic SELECT query for "${table}". Please refine the SQL to match your actual schema and requirements.`,
    });
  }

  if (lower.includes('count') || lower.includes('how many') || lower.includes('total')) {
    const tableMatch = lower.match(/(?:of|in|from)\s+(?:the\s+)?(\w+)/);
    const table = tableMatch ? tableMatch[1] : 'table_name';
    return JSON.stringify({
      sql: `SELECT COUNT(*) AS total FROM ${table};`,
      explanation: `AI unavailable — generated a basic COUNT query for "${table}". Please refine the SQL to match your actual schema.`,
    });
  }

  if (lower.includes('insert') || lower.includes('add') || lower.includes('create')) {
    return JSON.stringify({
      sql: `-- AI unavailable: Please write your INSERT statement based on your schema`,
      explanation: `AI query generation unavailable. Please write an INSERT statement matching your table schema.`,
    });
  }

  if (lower.includes('update') || lower.includes('modify') || lower.includes('change')) {
    return JSON.stringify({
      sql: `-- AI unavailable: Please write your UPDATE statement based on your schema`,
      explanation: `AI query generation unavailable. Please write an UPDATE statement with appropriate WHERE clause.`,
    });
  }

  if (lower.includes('delete') || lower.includes('remove')) {
    return JSON.stringify({
      sql: `-- AI unavailable: Please write your DELETE statement with a WHERE clause`,
      explanation: `AI query generation unavailable. Please write a DELETE statement with a proper WHERE clause to avoid accidental data loss.`,
    });
  }

  // Generic fallback
  return JSON.stringify({
    sql: `-- AI unavailable: Please write your SQL query manually`,
    explanation: `AI query generation unavailable for: "${query}". Please write the SQL query manually based on your database schema.`,
  });
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
