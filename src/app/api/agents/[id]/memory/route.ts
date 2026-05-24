import { NextRequest, NextResponse } from "next/server";
import {
  storeAgentMemory,
  getAgentMemories,
  searchAgentMemories,
  getAgentMemoryContext,
  cleanupAgentMemories,
  deleteAgentMemory,
  getAgentMemoryStats,
  extractAndStoreMemories,
  touchAgentMemory,
} from "@/lib/agent-memory";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "list";
  const query = url.searchParams.get("query");
  const category = url.searchParams.get("category") as
    | "preference"
    | "lesson"
    | "pattern"
    | "context"
    | "fact"
    | "skill"
    | null;

  try {
    switch (action) {
      case "search":
        if (!query)
          return NextResponse.json(
            { error: "Query required for search" },
            { status: 400 }
          );
        const searchResults = await searchAgentMemories(agentId, query, {
          category: category || undefined,
        });
        return NextResponse.json({ results: searchResults });

      case "context":
        const context = await getAgentMemoryContext(
          agentId,
          query || "",
          parseInt(url.searchParams.get("maxTokens") || "1000")
        );
        return NextResponse.json({ context });

      case "stats":
        const stats = await getAgentMemoryStats(agentId);
        return NextResponse.json({ stats });

      case "list":
      default:
        const memories = await getAgentMemories(agentId, {
          category: category || undefined,
          limit: parseInt(url.searchParams.get("limit") || "50"),
          minConfidence: url.searchParams.get("minConfidence")
            ? parseFloat(url.searchParams.get("minConfidence")!)
            : undefined,
          tags: url.searchParams.get("tags")
            ? url.searchParams.get("tags")!.split(",")
            : undefined,
        });
        return NextResponse.json({ memories });
    }
  } catch (err) {
    console.error("[Agent Memory API] GET error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;
  const body = await req.json();

  try {
    if (body.action === "store") {
      if (!body.category || !body.key || !body.value) {
        return NextResponse.json(
          {
            error:
              "Missing required fields: category, key, value",
          },
          { status: 400 }
        );
      }
      const entry = await storeAgentMemory(
        agentId,
        body.category,
        body.key,
        body.value,
        {
          confidence: body.confidence,
          sourceConversationId: body.sourceConversationId,
          tags: body.tags,
          ttlHours: body.ttlHours,
        }
      );
      return NextResponse.json({ entry }, { status: 201 });
    }

    if (body.action === "extract") {
      if (!body.conversationId || !body.userMessage || !body.assistantResponse) {
        return NextResponse.json(
          {
            error:
              "Missing required fields: conversationId, userMessage, assistantResponse",
          },
          { status: 400 }
        );
      }
      const stored = await extractAndStoreMemories(
        agentId,
        body.conversationId,
        body.userMessage,
        body.assistantResponse
      );
      return NextResponse.json({ stored });
    }

    if (body.action === "cleanup") {
      const removed = await cleanupAgentMemories(agentId);
      return NextResponse.json({ removed });
    }

    if (body.action === "touch") {
      if (!body.memoryId) {
        return NextResponse.json(
          { error: "Missing required field: memoryId" },
          { status: 400 }
        );
      }
      await touchAgentMemory(body.memoryId);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[Agent Memory API] POST error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const url = new URL(req.url);
  const memoryId = url.searchParams.get("memoryId");

  if (!memoryId) {
    return NextResponse.json(
      { error: "Missing required query param: memoryId" },
      { status: 400 }
    );
  }

  try {
    const success = await deleteAgentMemory(memoryId);
    if (!success) {
      return NextResponse.json(
        { error: "Memory not found or already deleted" },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Agent Memory API] DELETE error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
