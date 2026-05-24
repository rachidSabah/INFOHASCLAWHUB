import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cosineSimilarity } from "@/lib/embeddings";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") ?? "timeline";

    if (type === "timeline") {
      // Memory timeline: memories ordered by creation date
      const memories = await db.contextMemory.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          type: true,
          category: true,
          content: true,
          summary: true,
          priority: true,
          accessCount: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Group by date
      const timeline: Record<string, Array<{
        id: string;
        type: string;
        category: string;
        content: string;
        summary: string | null;
        priority: number;
        accessCount: number;
      }>> = {};

      for (const m of memories) {
        const date = new Date(m.createdAt).toISOString().split("T")[0];
        if (!timeline[date]) timeline[date] = [];
        timeline[date].push({
          id: m.id,
          type: m.type,
          category: m.category,
          content: m.content.slice(0, 300),
          summary: m.summary,
          priority: m.priority,
          accessCount: m.accessCount,
        });
      }

      return NextResponse.json({ type: "timeline", data: timeline });
    }

    if (type === "cluster") {
      // Cluster memories by category and type
      const byCategory = await db.contextMemory.groupBy({
        by: ["category"],
        _count: true,
        _avg: { priority: true },
      });

      const byType = await db.contextMemory.groupBy({
        by: ["type"],
        _count: true,
        _avg: { priority: true },
      });

      const clusters = byCategory.map((c) => ({
        category: c.category,
        count: c._count,
        avgPriority: c._avg.priority ?? 0,
      }));

      const typeClusters = byType.map((t) => ({
        type: t.type,
        count: t._count,
        avgPriority: t._avg.priority ?? 0,
      }));

      return NextResponse.json({ type: "cluster", data: { byCategory: clusters, byType: typeClusters } });
    }

    if (type === "graph") {
      // Relationship graph data
      const links = await db.memoryLink.findMany({
        take: 500,
      });

      // Get the memory nodes referenced in links
      const memoryIds = new Set<string>();
      for (const link of links) {
        memoryIds.add(link.sourceId);
        memoryIds.add(link.targetId);
      }

      const memories = await db.contextMemory.findMany({
        where: { id: { in: Array.from(memoryIds) } },
        select: {
          id: true,
          type: true,
          category: true,
          content: true,
          summary: true,
          priority: true,
        },
      });

      // Compute similarity for top linked memories
      const nodes = memories.map((m) => ({
        id: m.id,
        type: m.type,
        category: m.category,
        label: (m.summary || m.content).slice(0, 80),
        priority: m.priority,
      }));

      const edges = links.map((l) => ({
        source: l.sourceId,
        target: l.targetId,
        relationType: l.relationType,
        strength: l.strength,
      }));

      return NextResponse.json({ type: "graph", data: { nodes, edges } });
    }

    return NextResponse.json({ error: "Invalid type. Use 'timeline', 'cluster', or 'graph'" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get memory visualization";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
