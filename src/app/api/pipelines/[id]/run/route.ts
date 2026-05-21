import { NextResponse } from "next/server";
import { pipelineStore } from "@/lib/pipeline-store";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const pipeline = pipelineStore.get(id);
    if (!pipeline) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (pipeline.status !== "draft" && pipeline.status !== "paused") {
      return NextResponse.json({ error: `Cannot run in '${pipeline.status}' status` }, { status: 400 });
    }
    pipeline.status = "running";
    pipeline.currentStep = 0;
    pipeline.updatedAt = new Date().toISOString();
    return NextResponse.json(pipeline);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
    pipeline.status = "running";
    pipeline.currentStep = 0;
    pipeline.updatedAt = new Date().toISOString();
    return NextResponse.json(pipeline);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
