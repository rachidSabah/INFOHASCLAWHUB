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

    if (!key || !content) {
      return errorResponse("Key and Content are required", 400);
    }

    if (typeof key !== "string" || typeof content !== "string") {
      return errorResponse("Key and Content must be strings", 400);
    }

    const memory = await db.memory.create({
      data: {
        key,
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
