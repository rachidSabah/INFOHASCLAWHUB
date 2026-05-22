import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const columnId = searchParams.get("columnId");
    if (!columnId) {
      return NextResponse.json({ error: "columnId required" }, { status: 400 });
    }
    const cards = await db.kanbanCard.findMany({
      where: { columnId },
      orderBy: { order: "asc" },
    });
    return NextResponse.json(cards);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { columnId, title, description, priority, labels, status, subtasks } = body as {
      columnId: string;
      title: string;
      description?: string;
      priority?: string;
      labels?: string;
      status?: string;
      subtasks?: string;
    };

    if (!columnId || !title) {
      return NextResponse.json(
        { error: "columnId and title are required" },
        { status: 400 }
      );
    }

    // Get the next order value
    const maxOrder = await db.kanbanCard.aggregate({
      where: { columnId },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    const card = await db.kanbanCard.create({
      data: {
        columnId,
        title,
        description: description || "",
        priority: priority || "medium",
        labels: labels || "[]",
        status: status || "backlog",
        subtasks: subtasks || "[]",
        order: nextOrder,
      },
    });

    return NextResponse.json(card, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
