import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const p = await db.agentPipeline.findUnique({ where: { id } });
    if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const updated = await db.agentPipeline.update({
      where: { id },
      data: { status: "paused" },
    });
    return NextResponse.json({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (e: unknown) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 }); }
}
