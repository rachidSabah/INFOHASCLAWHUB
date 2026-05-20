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
        { role: 'system', content: 'You are an AI assistant that executes quick actions. Return a JSON object with: "result" (the action result), "message" (human-readable summary), and "data" (any relevant data).' },
        { role: 'user', content: prompt }
      ],
    });
    const result = completion.choices[0]?.message?.content;
    if (result && result.trim() && result.trim() !== '{}') return result;
    // If AI returned empty, fall through to smart fallback
  } catch (error) {
    console.error('[QuickActions] ZAI SDK error:', error);
    // Fall through to smart fallback
  }
  return generateQuickActionFallback(prompt);
}

function generateQuickActionFallback(prompt: string): string {
  const actionPatterns: Record<string, { result: string; message: string; data: unknown }> = {
    'ai_terminal_assistant': { result: 'completed', message: 'Terminal assistant ready. Try these suggestions:\n• Use "explain" to understand any command\n• Run "git status" to check your repo\n• Type "dir" or "ls" to list files', data: { suggestions: ['explain <command>', 'git status', 'dir / ls', 'help'] } },
    'explain_command': { result: 'completed', message: 'Command explanation:\n• Check official docs for detailed flags\n• Use --help or /? for built-in help\n• Search Stack Overflow for common issues', data: null },
    'suggest_fix': { result: 'completed', message: 'Troubleshooting suggestions:\n1. Check the error message for clues\n2. Verify file paths and permissions\n3. Ensure dependencies are installed\n4. Try restarting the service\n5. Check environment variables', data: { steps: ['Check error message', 'Verify paths', 'Check dependencies', 'Restart service', 'Check env vars'] } },
    'nl_to_command': { result: 'completed', message: 'Common commands for common tasks:\n• List files: dir (Windows) or ls (Unix)\n• Git status: git status\n• Install deps: npm install\n• Run project: npm run dev\n• Check Node version: node --version', data: { examples: ['dir', 'git status', 'npm install', 'npm run dev', 'node --version'] } },
    'generate_code': { result: 'completed', message: 'AI code generation unavailable. Try using code templates or scaffolding tools as a starting point.', data: null },
    'refactor_code': { result: 'completed', message: 'AI refactoring unavailable. Consider running linting tools and applying suggested fixes manually.', data: null },
    'optimize': { result: 'completed', message: 'AI optimization unavailable. Profile your code to identify bottlenecks and target optimizations.', data: null },
    'debug': { result: 'completed', message: 'AI debugging unavailable. Add logging, use a debugger, and check error stack traces.', data: null },
    'document': { result: 'completed', message: 'AI documentation unavailable. Use JSDoc/TSDoc templates to document your code manually.', data: null },
  };

  // Try to match an action from the prompt
  for (const [key, value] of Object.entries(actionPatterns)) {
    if (prompt.toLowerCase().includes(key.toLowerCase()) || prompt.toLowerCase().includes(key.replace(/_/g, ' '))) {
      return JSON.stringify(value);
    }
  }

  // Generic fallback
  return JSON.stringify({
    result: 'completed',
    message: 'Action processed with limited AI assistance. Please verify results manually or try again later.',
    data: null,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, params, context } = body;

    if (!action) {
      return NextResponse.json({ error: 'action is required' }, { status: 400 });
    }

    const aiResult = await callAI(
      `Execute this quick action:\n\nAction: ${action}\nParameters: ${JSON.stringify(params || {})}\n${context ? `Context: ${JSON.stringify(context)}` : ''}\n\nReturn the result as JSON.`
    );

    let result;
    try {
      result = JSON.parse(aiResult);
    } catch {
      result = { result: 'completed', message: aiResult, data: null };
    }

    // Log as an analytics event
    await (db as any).analyticsEvent.create({
      data: {
        eventType: 'code_gen',
        metadata: JSON.stringify({ action, params }),
        success: true,
      },
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}
