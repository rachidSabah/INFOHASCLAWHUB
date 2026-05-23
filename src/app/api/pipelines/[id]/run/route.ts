import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const pipeline = await db.agentPipeline.findUnique({ where: { id } });
    if (!pipeline) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (pipeline.status !== "draft" && pipeline.status !== "paused") {
      return NextResponse.json({ error: `Cannot run in '${pipeline.status}' status` }, { status: 400 });
    }
    const updated = await db.agentPipeline.update({
      where: { id },
      data: { status: "running", currentStep: 0 },
    });
    return NextResponse.json({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (e: unknown) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 }); }
}
