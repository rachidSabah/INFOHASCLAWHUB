import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await db.agentPipeline.findUnique({ where: { id } });
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const existing = await db.agentPipeline.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.description !== undefined) data.description = body.description;
  if (body.steps !== undefined) data.steps = typeof body.steps === 'string' ? body.steps : JSON.stringify(body.steps);
  if (body.status !== undefined) data.status = body.status;
  if (body.currentStep !== undefined) data.currentStep = body.currentStep;
  if (body.results !== undefined) data.results = typeof body.results === 'string' ? body.results : JSON.stringify(body.results);
  if (body.parallelGroups !== undefined) data.parallelGroups = typeof body.parallelGroups === 'string' ? body.parallelGroups : JSON.stringify(body.parallelGroups);

  const updated = await db.agentPipeline.update({ where: { id }, data });
  return NextResponse.json({
    ...updated,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.agentPipeline.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
