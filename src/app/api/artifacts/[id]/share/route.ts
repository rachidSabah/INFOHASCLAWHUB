import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const artifact = await db.artifact.findUnique({ where: { id } });
    if (!artifact) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const shareToken = artifact.shareToken || crypto.randomUUID();
    await db.artifact.update({
      where: { id },
      data: { shareToken, isPublic: true },
    });

    return NextResponse.json({
      shareToken,
      shareURL: `/share/${shareToken}`,
      artifactId: id,
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
