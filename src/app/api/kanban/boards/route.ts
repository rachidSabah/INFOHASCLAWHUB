import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const DEFAULT_COLUMNS = [
  { name: "Backlog", color: "#6b7280", order: 0 },
  { name: "Planning", color: "#3b82f6", order: 1 },
  { name: "In Progress", color: "#f59e0b", order: 2 },
  { name: "Multi-Agent", color: "#8b5cf6", order: 3 },
  { name: "Review", color: "#f97316", order: 4 },
  { name: "Testing", color: "#06b6d4", order: 5 },
  { name: "Completed", color: "#10b981", order: 6 },
  { name: "Failed", color: "#ef4444", order: 7 },
];

export async function GET() {
  try {
    const boards = await db.kanbanBoard.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        columns: {
          orderBy: { order: "asc" },
          include: {
            cards: {
              orderBy: { order: "asc" },
            },
          },
        },
      },
    });
    return NextResponse.json(boards);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = (body as Record<string, unknown>).name as string | undefined;

    const board = await db.kanbanBoard.create({
      data: {
        name: name || "Default Board",
        columns: {
          create: DEFAULT_COLUMNS.map((c) => ({
            name: c.name,
            color: c.color,
            order: c.order,
          })),
        },
      },
      include: {
        columns: {
          orderBy: { order: "asc" },
          include: {
            cards: { orderBy: { order: "asc" } },
          },
        },
      },
    });

    // Seed sample cards into the newly created columns
    const columnMap = new Map<string, string>();
    for (const col of board.columns) {
      columnMap.set(col.name, col.id);
    }

    const sampleCards = [
      { col: "Backlog", title: "Design Auth System", description: "OAuth 2.0 + JWT auth with MFA", priority: "high", labels: '["auth","security"]', subtasks: '[{"title":"OAuth flow","done":false},{"title":"JWT generation","done":false},{"title":"MFA setup","done":false}]' },
      { col: "Planning", title: "DB Schema Design", description: "Normalized schema with migrations", priority: "high", labels: '["database"]', subtasks: '[{"title":"Users table","done":false},{"title":"Relations","done":false},{"title":"Migrations","done":false}]' },
      { col: "In Progress", title: "Build REST API", description: "Express API with middleware", priority: "critical", labels: '["backend","api"]', subtasks: '[{"title":"CRUD endpoints","done":true},{"title":"Auth middleware","done":false},{"title":"Rate limiting","done":false},{"title":"Swagger docs","done":false}]' },
      { col: "In Progress", title: "Frontend Dashboard", description: "React dashboard with charts", priority: "high", labels: '["frontend","react"]', subtasks: '[{"title":"Layout","done":true},{"title":"Charts","done":false},{"title":"Dark mode","done":true}]' },
      { col: "Multi-Agent", title: "Orchestrate Agents", description: "Agent pipeline for review+test", priority: "medium", labels: '["ai","agents"]', subtasks: '[{"title":"Agent contracts","done":false},{"title":"Memory bus","done":false}]' },
      { col: "Review", title: "Code Review Sprint", description: "Review PRs #45-52", priority: "medium", labels: '["review"]', subtasks: '[{"title":"PR #45 Auth","done":false},{"title":"PR #47 API","done":false},{"title":"PR #50 Frontend","done":false}]' },
      { col: "Testing", title: "E2E Test Suite", description: "Playwright critical flows", priority: "high", labels: '["testing","qa"]', subtasks: '[{"title":"Login flow","done":false},{"title":"Kanban CRUD","done":false},{"title":"API tests","done":false}]' },
      { col: "Completed", title: "Initialize Repo", description: "Git repo setup and README", priority: "medium", labels: '["setup"]', subtasks: '[{"title":"Create repo","done":true},{"title":"README","done":true},{"title":"Structure","done":true}]' },
    ];

    for (const card of sampleCards) {
      const columnId = columnMap.get(card.col);
      if (columnId) {
        await db.kanbanCard.create({
          data: {
            columnId,
            title: card.title,
            description: card.description,
            priority: card.priority,
            labels: card.labels,
            status: card.col.toLowerCase().replace(/\s+/g, "-"),
            subtasks: card.subtasks,
            order: 0,
          },
        });
      }
    }

    return NextResponse.json({ id: board.id }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
