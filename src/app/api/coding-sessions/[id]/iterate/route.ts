import { db } from "@/lib/db";
import { NextRequest, NextResponse } from 'next/server';

import ZAI from 'z-ai-web-dev-sdk';



async function callAI(prompt: string) {
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages: [
      { role: 'system', content: 'You are an expert software developer. Execute the given coding step and describe what you would do. Return a JSON object with "action", "files" (array of file paths), and "summary" fields.' },
      { role: 'user', content: prompt }
    ],
  });
  return completion.choices[0]?.message?.content || '';
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
