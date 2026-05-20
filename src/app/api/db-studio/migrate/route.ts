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
        { role: 'system', content: 'You are a database migration expert. Generate safe, reversible migration SQL. Return a JSON object with "up" (migration SQL), "down" (rollback SQL), and "description" fields.' },
        { role: 'user', content: prompt }
      ],
    });
    const result = completion.choices[0]?.message?.content;
    if (result && result.trim() && result.trim() !== '{}') return result;
    // If AI returned empty, fall through to smart fallback
  } catch (error) {
    console.error('[DBMigrate] ZAI SDK error:', error);
    // Fall through to smart fallback
  }
  return generateMigrateFallback(prompt);
}

function generateMigrateFallback(prompt: string): string {
  // Extract the change description from the prompt
  const changesMatch = prompt.match(/Requested changes:\s*(.+)/);
  const changes = changesMatch ? changesMatch[1].trim() : 'database modification';
  const lower = changes.toLowerCase();

  let up = '-- AI migration unavailable: Please write migration SQL manually';
  let down = '-- AI rollback unavailable: Please write rollback SQL manually';
  let description = `AI-generated migration unavailable for: ${changes}`;

  if (lower.includes('add column') || lower.includes('new column') || lower.includes('add field')) {
    const colMatch = lower.match(/(?:add|new)\s+(?:column|field)\s+"?(\w+)"?/);
    const col = colMatch ? colMatch[1] : 'new_column';
    up = `ALTER TABLE table_name ADD COLUMN ${col} TEXT;`; 
    down = `ALTER TABLE table_name DROP COLUMN ${col};`;
    description = `Add column "${col}" — AI generated template, please update table name and column type.`;
  } else if (lower.includes('drop column') || lower.includes('remove column')) {
    const colMatch = lower.match(/(?:drop|remove)\s+(?:column|field)\s+"?(\w+)"?/);
    const col = colMatch ? colMatch[1] : 'column_name';
    up = `ALTER TABLE table_name DROP COLUMN ${col};`;
    down = `ALTER TABLE table_name ADD COLUMN ${col} TEXT;`;
    description = `Drop column "${col}" — AI generated template, please verify before running.`;
  } else if (lower.includes('create table') || lower.includes('new table')) {
    const tableMatch = lower.match(/(?:create|new)\s+table\s+"?(\w+)"?/);
    const table = tableMatch ? tableMatch[1] : 'new_table';
    up = `CREATE TABLE ${table} (\n  id INTEGER PRIMARY KEY,\n  created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n);`;
    down = `DROP TABLE IF EXISTS ${table};`;
    description = `Create table "${table}" — AI generated template with basic columns. Please add all required columns.`;
  } else if (lower.includes('add index') || lower.includes('create index')) {
    const idxMatch = lower.match(/(?:add|create)\s+index\s+(?:on\s+)?"?(\w+)"?/);
    const idx = idxMatch ? idxMatch[1] : 'column_name';
    up = `CREATE INDEX idx_${idx} ON table_name (${idx});`;
    down = `DROP INDEX IF EXISTS idx_${idx};`;
    description = `Add index on "${idx}" — AI generated template, please update table and column names.`;
  }

  return JSON.stringify({ up, down, description });
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
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
