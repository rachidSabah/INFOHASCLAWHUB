import { NextResponse } from "next/server";
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
    const boards = await (db as any).$queryRawUnsafe("SELECT * FROM KanbanBoard ORDER BY createdAt DESC LIMIT 5");
    const result = [];
    for (const b of boards) {
      const cols = await (db as any).$queryRawUnsafe("SELECT * FROM KanbanColumn WHERE boardId = ? ORDER BY \"order\"", b.id);
      const columns = [];
      for (const col of cols) {
        const cards = await (db as any).$queryRawUnsafe("SELECT * FROM KanbanCard WHERE columnId = ? ORDER BY \"order\"", col.id);
        columns.push({ ...col, cards });
      }
      result.push({ ...b, columns });
    }
    return NextResponse.json(result.length > 0 ? result : []);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function POST() {
  try {
    const id = crypto.randomUUID();
    await (db as any).$executeRawUnsafe("INSERT INTO KanbanBoard (id, name, createdAt, updatedAt) VALUES (?, 'Default Board', datetime('now'), datetime('now'))", id);
    const columnIds: Record<string, string> = {};
    for (const c of DEFAULT_COLUMNS) {
      const cid = crypto.randomUUID();
      columnIds[c.name] = cid;
      await (db as any).$executeRawUnsafe("INSERT INTO KanbanColumn (id, boardId, name, color, \"order\", createdAt) VALUES (?, ?, ?, ?, ?, datetime('now'))", cid, id, c.name, c.color, c.order);
    }
    const cards = [
      ["Backlog","Design Auth System","OAuth 2.0 + JWT auth with MFA","high",'["auth","security"]','[{"title":"OAuth flow","done":false},{"title":"JWT generation","done":false},{"title":"MFA setup","done":false}]'],
      ["Planning","DB Schema Design","Normalized schema with migrations","high",'["database"]','[{"title":"Users table","done":false},{"title":"Relations","done":false},{"title":"Migrations","done":false}]'],
      ["In Progress","Build REST API","Express API with middleware","critical",'["backend","api"]','[{"title":"CRUD endpoints","done":true},{"title":"Auth middleware","done":false},{"title":"Rate limiting","done":false},{"title":"Swagger docs","done":false}]'],
      ["In Progress","Frontend Dashboard","React dashboard with charts","high",'["frontend","react"]','[{"title":"Layout","done":true},{"title":"Charts","done":false},{"title":"Dark mode","done":true}]'],
      ["Multi-Agent","Orchestrate Agents","Agent pipeline for review+test","medium",'["ai","agents"]','[{"title":"Agent contracts","done":false},{"title":"Memory bus","done":false}]'],
      ["Review","Code Review Sprint","Review PRs #45-52","medium",'["review"]','[{"title":"PR #45 Auth","done":false},{"title":"PR #47 API","done":false},{"title":"PR #50 Frontend","done":false}]'],
      ["Testing","E2E Test Suite","Playwright critical flows","high",'["testing","qa"]','[{"title":"Login flow","done":false},{"title":"Kanban CRUD","done":false},{"title":"API tests","done":false}]'],
      ["Completed","Initialize Repo","Git repo setup and README","medium",'["setup"]','[{"title":"Create repo","done":true},{"title":"README","done":true},{"title":"Structure","done":true}]'],
    ];
    for (const [col, title, desc, priority, labels, subtasks] of cards) {
      if (columnIds[col]) {
        await (db as any).$executeRawUnsafe("INSERT INTO KanbanCard (id, columnId, title, description, priority, labels, status, subtasks, \"order\", createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))", crypto.randomUUID(), columnIds[col], title, desc, priority, labels, col.toLowerCase().replace(/\s+/g, "-"), subtasks);
      }
    }
    return NextResponse.json({ id }, { status: 201 });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
