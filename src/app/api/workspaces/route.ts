import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const workspaces = await db.workspace.findMany({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });
    return NextResponse.json(workspaces);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, description } = await req.json();
    if (!name) {
      return NextResponse.json(
        { error: "Name required" },
        { status: 400 }
      );
    }

    const workspace = await db.workspace.create({
      data: { name, description: description || null },
    });

    return NextResponse.json(workspace, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
