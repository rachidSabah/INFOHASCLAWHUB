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
        { role: 'system', content: 'You are an expert software architect. Generate a detailed step-by-step plan for the given coding task. Return the plan as a JSON object with a "steps" array of strings.' },
        { role: 'user', content: prompt }
      ],
    });
    const result = completion.choices[0]?.message?.content;
    if (result && result.trim()) return result;
    // If AI returned empty, fall through to smart fallback
  } catch (error) {
    console.error('[CodingPlan] ZAI SDK error:', error);
    // Fall through to smart fallback
  }
  return generatePlanFallback(prompt);
}

function generatePlanFallback(prompt: string): string {
  const steps: string[] = [];
  const lower = prompt.toLowerCase();

  // Keyword-based step generation
  if (lower.includes('create') || lower.includes('build') || lower.includes('implement')) {
    steps.push('Analyze requirements and define scope', 'Set up project structure and dependencies', 'Implement core functionality', 'Add error handling and edge cases', 'Write tests for the implementation');
  }
  if (lower.includes('fix') || lower.includes('bug') || lower.includes('repair')) {
    steps.push('Reproduce the bug and gather error details', 'Identify root cause by reviewing relevant code', 'Implement the fix with minimal changes', 'Add regression tests', 'Verify the fix resolves the issue');
  }
  if (lower.includes('refactor') || lower.includes('restructure') || lower.includes('reorganize')) {
    steps.push('Identify code smells and areas for improvement', 'Plan refactoring strategy with minimal disruption', 'Apply refactoring incrementally', 'Run existing tests after each change', 'Update documentation to reflect changes');
  }
  if (lower.includes('test') || lower.includes('testing')) {
    steps.push('Review existing test coverage', 'Identify untested code paths', 'Write unit tests for core logic', 'Add integration tests for key flows', 'Run full test suite and verify pass rate');
  }
  if (lower.includes('deploy') || lower.includes('release') || lower.includes('publish')) {
    steps.push('Verify all tests pass', 'Update version and changelog', 'Build production artifacts', 'Deploy to staging environment', 'Validate deployment and promote to production');
  }
  if (lower.includes('migrate') || lower.includes('upgrade')) {
    steps.push('Assess current state and migration requirements', 'Back up existing data and configuration', 'Implement migration scripts', 'Test migration on a copy of production data', 'Execute migration and verify data integrity');
  }

  // If no keywords matched, generate generic steps from the task description
  if (steps.length === 0) {
    steps.push(
      'Understand the requirements and define acceptance criteria',
      'Research existing codebase and relevant patterns',
      'Design the solution approach',
      'Implement the core changes',
      'Test and validate the implementation',
      'Review and document the changes'
    );
  }

  return JSON.stringify({ steps });
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await db.codingSession.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json({ error: 'Coding session not found' }, { status: 404 });
    }

    const aiResult = await callAI(
      `Create a step-by-step plan for this coding task:\n\nWorkspace: ${session.workspacePath}\nTask: ${session.task}\n\nReturn a JSON object with "steps" as a string array.`
    );

    let plan;
    try {
      plan = JSON.parse(aiResult);
    } catch {
      plan = { steps: aiResult.split('\n').filter((s: string) => s.trim()) };
    }

    const updated = await db.codingSession.update({
      where: { id },
      data: {
        status: 'planning',
        plan: JSON.stringify(plan),
      },
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
