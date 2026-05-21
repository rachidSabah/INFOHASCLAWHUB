import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const artifact = await db.artifact.findUnique({ where: { id } });
    if (!artifact) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const versions = await db.artifactVersion.findMany({
      where: { artifactId: id },
      orderBy: { version: "desc" },
    });
    await db.artifact.update({ where: { id }, data: { viewCount: (artifact.viewCount || 0) + 1 } });
    return NextResponse.json({ ...artifact, versions });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const current = await db.artifact.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const newVersion = current.version + 1;
    const updateData: any = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.content !== undefined) updateData.content = body.content;
    if (body.metadata !== undefined) updateData.metadata = body.metadata;
    if (body.isPublic !== undefined) updateData.isPublic = body.isPublic;
    updateData.version = newVersion;

    const updated = await db.artifact.update({ where: { id }, data: updateData });

    if (body.content !== undefined || body.title !== undefined) {
      await db.artifactVersion.create({
        data: {
          artifactId: id,
          version: newVersion,
          content: body.content || current.content,
          changeLog: body.changeLog || `Updated to version ${newVersion}`,
        },
      });
    }

    return NextResponse.json(updated);
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.artifactVersion.deleteMany({ where: { artifactId: id } });
    await db.artifact.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
