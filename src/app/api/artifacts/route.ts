import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const where: any = {};
    if (type) where.type = type;
    const artifacts = await db.artifact.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    return NextResponse.json(artifacts);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title, type, content, metadata } = await req.json();
    if (!title || !type) {
      return NextResponse.json({ error: "Title and type required" }, { status: 400 });
    }
    const artifact = await db.artifact.create({
      data: {
        title,
        type,
        content: content || "",
        metadata: metadata || null,
        version: 1,
      },
    });
    await db.artifactVersion.create({
      data: {
        artifactId: artifact.id,
        version: 1,
        content: content || "",
        changeLog: "Initial creation",
      },
    });
    return NextResponse.json(artifact, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
