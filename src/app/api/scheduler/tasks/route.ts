import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tasks = await db.cronTask.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(tasks);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, cronExpr, taskType, agentId, config, status, retryPolicy, dependencies } = body;

    if (!name || !cronExpr || !taskType || config === undefined) {
      return NextResponse.json(
        { error: "name, cronExpr, taskType, and config are required" },
        { status: 400 }
      );
    }

    // Ensure config is a JSON string
    const configStr = typeof config === "string" ? config : JSON.stringify(config);
    const retryPolicyStr = typeof retryPolicy === "string" ? retryPolicy : JSON.stringify(retryPolicy ?? {});
    const dependenciesStr = typeof dependencies === "string" ? dependencies : JSON.stringify(dependencies ?? []);

    const task = await db.cronTask.create({
      data: {
        name,
        description: description ?? null,
        cronExpr,
        taskType,
        agentId: agentId ?? null,
        config: configStr,
        status: status ?? "active",
        retryPolicy: retryPolicyStr,
        dependencies: dependenciesStr,
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
