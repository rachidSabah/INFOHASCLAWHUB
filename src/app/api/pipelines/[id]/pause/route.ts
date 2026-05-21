import { NextResponse } from "next/server";
import { pipelineStore } from "@/lib/pipeline-store";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const p = pipelineStore.get(id);
    if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });
    p.status = "paused";
    p.updatedAt = new Date().toISOString();
    pipelineStore.set(id, p);
    return NextResponse.json(p);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
