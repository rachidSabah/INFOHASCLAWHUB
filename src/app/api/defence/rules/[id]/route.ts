import { updateRule, deleteRule } from '@/lib/ai-defence-engine';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, description, ruleType, pattern, action, sensitivity, isEnabled } = body as {
      name?: string;
      description?: string;
      ruleType?: string;
      pattern?: string;
      action?: string;
      sensitivity?: string;
      isEnabled?: boolean;
    };

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (ruleType !== undefined) updates.ruleType = ruleType;
    if (pattern !== undefined) updates.pattern = pattern;
    if (action !== undefined) updates.action = action;
    if (sensitivity !== undefined) updates.sensitivity = sensitivity;
    if (isEnabled !== undefined) updates.isEnabled = isEnabled;

    const rule = await updateRule(id, updates);
    return NextResponse.json(rule);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteRule(id);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
