import { NextRequest, NextResponse } from "next/server";
import { getUniversalMemory } from "@/lib/universal-memory";

export const dynamic = "force-dynamic";

// ── GET /api/memory/context ────────────────────────────────────────────────────
// Search memories with semantic similarity.
// Query params: ?query=, ?types=, ?categories=, ?projectId=, ?agentId=, ?limit=

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;

    const query = searchParams.get("query") ?? "";
    if (!query.trim()) {
      return NextResponse.json(
        { error: "Query parameter 'query' is required and must not be empty" },
        { status: 400 }
      );
    }

    const typesParam = searchParams.get("types");
    const categoriesParam = searchParams.get("categories");
    const projectId = searchParams.get("projectId") ?? undefined;
    const agentId = searchParams.get("agentId") ?? undefined;
    const limitParam = searchParams.get("limit");

    const types = typesParam
      ? typesParam.split(",").map((t) => t.trim()).filter(Boolean)
      : undefined;
    const categories = categoriesParam
      ? categoriesParam.split(",").map((c) => c.trim()).filter(Boolean)
      : undefined;
    const limit = limitParam ? parseInt(limitParam, 10) : 10;

    if (isNaN(limit) || limit < 1) {
      return NextResponse.json(
        { error: "Parameter 'limit' must be a positive integer" },
        { status: 400 }
      );
    }

    const memory = getUniversalMemory();
    const results = await memory.search({
      query,
      types: types as
        | (
            | "episodic"
            | "semantic"
            | "procedural"
            | "project"
            | "agent"
            | "session"
          )[]
        | undefined,
      categories: categories as
        | (
            | "conversation"
            | "code"
            | "workflow"
            | "preference"
            | "error"
            | "success"
            | "research"
          )[]
        | undefined,
      projectId,
      agentId,
      limit,
    });

    return NextResponse.json({ results, count: results.length });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to search memories";
    console.error("[MEMORY_CONTEXT_GET]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── POST /api/memory/context ───────────────────────────────────────────────────
// Store a new memory.
// Body: { type, category, content, summary?, sourceId?, sourceType?, projectId?, agentId?, tags?, priority?, ttlHours? }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      type,
      category,
      content,
      summary,
      sourceId,
      sourceType,
      projectId,
      agentId,
      tags,
      priority,
      ttlHours,
    } = body;

    // ── Validation ──
    if (!type || typeof type !== "string") {
      return NextResponse.json(
        { error: "Field 'type' is required and must be a string" },
        { status: 400 }
      );
    }

    const validTypes = [
      "episodic",
      "semantic",
      "procedural",
      "project",
      "agent",
      "session",
    ];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    if (!category || typeof category !== "string") {
      return NextResponse.json(
        { error: "Field 'category' is required and must be a string" },
        { status: 400 }
      );
    }

    const validCategories = [
      "conversation",
      "code",
      "workflow",
      "preference",
      "error",
      "success",
      "research",
    ];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        {
          error: `Invalid category. Must be one of: ${validCategories.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "Field 'content' is required and must be a non-empty string" },
        { status: 400 }
      );
    }

    if (tags !== undefined && !Array.isArray(tags)) {
      return NextResponse.json(
        { error: "Field 'tags' must be an array of strings" },
        { status: 400 }
      );
    }

    if (priority !== undefined && typeof priority !== "number") {
      return NextResponse.json(
        { error: "Field 'priority' must be a number" },
        { status: 400 }
      );
    }

    if (ttlHours !== undefined && typeof ttlHours !== "number") {
      return NextResponse.json(
        { error: "Field 'ttlHours' must be a number" },
        { status: 400 }
      );
    }

    // ── Store ──
    const memory = getUniversalMemory();
    const stored = await memory.store({
      type: type as
        | "episodic"
        | "semantic"
        | "procedural"
        | "project"
        | "agent"
        | "session",
      category: category as
        | "conversation"
        | "code"
        | "workflow"
        | "preference"
        | "error"
        | "success"
        | "research",
      content,
      summary,
      sourceId,
      sourceType,
      projectId,
      agentId,
      tags,
      priority,
      ttlHours,
    });

    return NextResponse.json(stored, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to store memory";
    console.error("[MEMORY_CONTEXT_POST]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
