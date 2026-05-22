import { listRules, addRule } from '@/lib/ai-defence-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ruleType = searchParams.get('ruleType');
    const isEnabled = searchParams.get('isEnabled');

    const filter: Record<string, unknown> = {};
    if (ruleType) filter.ruleType = ruleType;
    if (isEnabled !== null) filter.isEnabled = isEnabled === 'true';

    const rules = await listRules(filter);
    return NextResponse.json(rules);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, ruleType, pattern, action, sensitivity } = body as {
      name: string;
      description: string;
      ruleType: string;
      pattern: string;
      action: string;
      sensitivity?: string;
    };

    if (!name || !description || !ruleType || !pattern || !action) {
      return NextResponse.json(
        { error: 'name, description, ruleType, pattern, and action are required' },
        { status: 400 }
      );
    }

    const rule = await addRule({
      name,
      description,
      ruleType: ruleType as 'prompt_injection' | 'pii' | 'safety' | 'command_injection' | 'path_traversal' | 'data_exfil',
      pattern,
      action: action as 'block' | 'redact' | 'flag' | 'hash',
      sensitivity: sensitivity as 'low' | 'medium' | 'high' | 'critical' | 'paranoid' | undefined,
    });
    return NextResponse.json(rule, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
