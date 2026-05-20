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
        { role: 'system', content: 'You are a voice coding assistant. Convert voice commands to code actions. Return a JSON object with: "action" (the detected action type), "code" (any generated code), "command" (the interpreted command), and "explanation".' },
        { role: 'user', content: prompt }
      ],
    });
    const result = completion.choices[0]?.message?.content;
    if (result && result.trim() && result.trim() !== '{}') return result;
    // If AI returned empty, fall through to smart fallback
  } catch (error) {
    console.error('[VoiceCoding] ZAI SDK error:', error);
    // Fall through to smart fallback
  }
  return generateVoiceCodingFallback(prompt);
}

function generateVoiceCodingFallback(prompt: string): string {
  // Extract transcript from the prompt
  const transcriptMatch = prompt.match(/Transcript:\s*"([^"]+)"/);
  const transcript = transcriptMatch ? transcriptMatch[1].trim() : '';
  const lower = transcript.toLowerCase();

  let action = 'unknown';
  let code = '';
  let command = transcript;
  let explanation = 'AI interpretation unavailable. Voice command could not be processed automatically.';

  // Basic keyword-based command interpretation
  if (lower.includes('create') || lower.includes('make') || lower.includes('add') || lower.includes('new')) {
    if (lower.includes('function') || lower.includes('method')) {
      action = 'create_function';
      const nameMatch = lower.match(/(?:called|named)\s+"?(\w+)"?/);
      const name = nameMatch ? nameMatch[1] : 'newFunction';
      code = `function ${name}() {\n  // TODO: Implement ${name}\n}\n`;
      explanation = `Interpreted as: create a function named "${name}". AI code generation unavailable — please complete the implementation.`;
    } else if (lower.includes('component')) {
      action = 'create_component';
      code = `export default function NewComponent() {\n  return <div>New Component</div>;\n}\n`;
      explanation = 'Interpreted as: create a new component. AI code generation unavailable — please customize the component.';
    } else if (lower.includes('file')) {
      action = 'create_file';
      code = `// New file created via voice command\n`;
      explanation = 'Interpreted as: create a new file. AI code generation unavailable — please add content manually.';
    } else {
      action = 'create';
      explanation = 'Interpreted as a create command. AI code generation unavailable — please implement manually.';
    }
  } else if (lower.includes('delete') || lower.includes('remove')) {
    action = 'delete';
    explanation = 'Interpreted as a delete/remove command. Please confirm before executing destructive actions.';
  } else if (lower.includes('fix') || lower.includes('repair') || lower.includes('debug')) {
    action = 'fix';
    explanation = 'Interpreted as a fix/debug command. AI diagnosis unavailable — check error messages and logs for clues.';
  } else if (lower.includes('run') || lower.includes('execute') || lower.includes('start')) {
    action = 'run';
    explanation = 'Interpreted as a run/execute command. Please verify the command before running.';
  } else if (lower.includes('test')) {
    action = 'test';
    explanation = 'Interpreted as a test command. AI test generation unavailable — please write tests manually.';
  } else if (lower.includes('refactor')) {
    action = 'refactor';
    explanation = 'Interpreted as a refactor command. AI refactoring unavailable — please identify and apply improvements manually.';
  }

  return JSON.stringify({ action, code, command, explanation });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transcript, language, context } = body;

    if (!transcript) {
      return NextResponse.json({ error: 'transcript is required' }, { status: 400 });
    }

    const aiResult = await callAI(
      `Process this voice coding command:\n\nTranscript: "${transcript}"\nLanguage: ${language || 'typescript'}\n${context ? `Code context:\n${context}` : ''}\n\nInterpret the command and generate appropriate code or action as JSON.`
    );

    let result;
    try {
      result = JSON.parse(aiResult);
    } catch {
      result = { action: 'unknown', code: '', command: transcript, explanation: aiResult };
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
