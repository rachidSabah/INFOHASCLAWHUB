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
        { role: 'system', content: 'You are an expert software developer. Execute the given coding step and describe what you would do. Return a JSON object with "action", "files" (array of file paths), and "summary" fields.' },
        { role: 'user', content: prompt }
      ],
    });
    const result = completion.choices[0]?.message?.content;
    if (result && result.trim()) return result;
  } catch (error) {
    console.error('[CodingIterate] ZAI SDK error:', error);
  }
  return generateIterationFallback(prompt);
}

function generateIterationFallback(prompt: string): string {
  const stepMatch = prompt.match(/Step:\s*(.+)/);
  const step = stepMatch ? stepMatch[1].trim() : 'Continue implementation';
  const iterationMatch = prompt.match(/Iteration:\s*(\d+)/);
  const iteration = iterationMatch ? iterationMatch[1] : '1';

  return JSON.stringify({
    action: 'code',
    files: [],
    summary: `Iteration ${iteration}: ${step} — AI unavailable, manual implementation recommended. Review the step description and implement accordingly.`,
  });
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

    if (session.iterations >= session.maxIterations) {
      return NextResponse.json({ error: 'Max iterations reached' }, { status: 400 });
    }

    const plan = session.plan ? JSON.parse(session.plan) : { steps: [] };
    const currentStepIndex = session.iterations;
    const currentStep = plan.steps?.[currentStepIndex] || session.task;

    const aiResult = await callAI(
      `Execute this coding step:\n\nStep: ${currentStep}\nOverall Task: ${session.task}\nWorkspace: ${session.workspacePath}\nIteration: ${session.iterations + 1}/${session.maxIterations}`
    );

    let iterationResult;
    try {
      iterationResult = JSON.parse(aiResult);
    } catch {
      iterationResult = { action: 'code', files: [], summary: aiResult };
    }

    const diffLog = session.diffLog ? JSON.parse(session.diffLog) : [];
    diffLog.push({
      timestamp: new Date().toISOString(),
      step: currentStepIndex,
      diff: iterationResult,
    });

    const checkpoints = session.checkpoints ? JSON.parse(session.checkpoints) : [];
    checkpoints.push({
      id: `cp-${session.iterations + 1}`,
      timestamp: new Date().toISOString(),
      description: `After iteration ${session.iterations + 1}: ${iterationResult.summary?.substring(0, 100) || 'Step completed'}`,
    });

    const newIterations = session.iterations + 1;
    const isComplete = newIterations >= (plan.steps?.length || session.maxIterations);

    const updated = await db.codingSession.update({
      where: { id },
      data: {
        iterations: newIterations,
        status: isComplete ? 'committed' : 'coding',
        diffLog: JSON.stringify(diffLog),
        checkpoints: JSON.stringify(checkpoints),
        result: isComplete ? `Completed in ${newIterations} iterations` : null,
      },
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
