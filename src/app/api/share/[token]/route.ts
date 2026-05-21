import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const artifact = await db.artifact.findUnique({ where: { shareToken: token } });
    if (!artifact) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const versions = await db.artifactVersion.findMany({
      where: { artifactId: artifact.id },
      orderBy: { version: "desc" },
    });

    await db.artifact.update({
      where: { id: artifact.id },
      data: { viewCount: (artifact.viewCount || 0) + 1 },
    });

    return NextResponse.json({ ...artifact, versions });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
