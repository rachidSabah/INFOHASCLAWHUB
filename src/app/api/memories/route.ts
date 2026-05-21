import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = 'force-dynamic';

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const search = url.searchParams.get("search") || "";

    let memories;
    if (search) {
      memories = await db.memory.findMany({
        where: {
          OR: [
            { key: { contains: search } },
            { content: { contains: search } },
          ],
        },
        orderBy: { updatedAt: "desc" },
      });
    } else {
      memories = await db.memory.findMany({
        orderBy: { updatedAt: "desc" },
      });
    }

    return NextResponse.json(memories);
  } catch (error) {
    console.error("[MEMORIES_GET]", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch memories";
    return errorResponse(errorMessage, 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { key, content, source } = body;

    if (!content) {
      return errorResponse("Content is required", 400);
    }

    if (typeof content !== "string") {
      return errorResponse("Content must be a string", 400);
    }

    // Auto-generate key if not provided
    const keyValue = key || `memory-${Date.now()}`;

    const memory = await db.memory.create({
      data: {
        key: keyValue,
        content,
        source: source ?? "manual",
      },
    });

    return NextResponse.json(memory, { status: 201 });
  } catch (error) {
    console.error("[MEMORIES_POST]", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to create memory";
    return errorResponse(errorMessage, 500);
  }
}
