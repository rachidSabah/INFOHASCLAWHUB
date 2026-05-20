import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const doc = await (db as any).knowledgeDocument.findUnique({
      where: { id },
      include: { chunks: { orderBy: { index: "asc" } } },
    });

    if (!doc) {
      return new NextResponse("Not found", { status: 404 });
    }

    return NextResponse.json(doc);
  } catch (error) {
    console.error("[KNOWLEDGE_DOC_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await (db as any).knowledgeDocument.delete({
      where: { id },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[KNOWLEDGE_DOC_DELETE]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
