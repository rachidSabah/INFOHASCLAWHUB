import { NextResponse } from "next/server";
import { pipelineStore } from "@/lib/pipeline-store";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = pipelineStore.get(id);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(p);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const p = pipelineStore.get(id);
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (body.name !== undefined) p.name = body.name;
  if (body.description !== undefined) p.description = body.description;
  if (body.steps !== undefined) p.steps = body.steps;
  p.updatedAt = new Date().toISOString();
  return NextResponse.json(p);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  pipelineStore.delete(id);
  return NextResponse.json({ success: true });
}
