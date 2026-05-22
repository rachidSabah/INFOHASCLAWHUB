import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const actor = req.nextUrl.searchParams.get("actor") || undefined;
    const action = req.nextUrl.searchParams.get("action") || undefined;
    const risk = req.nextUrl.searchParams.get("risk") || undefined;
    const logs = await db.auditLog.findMany({
      where: { ...(actor && { actor }), ...(action && { action }), ...(risk && { risk }) },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ logs, count: logs.length });
  } catch (error: unknown) {
    console.error("[Compliance] GET error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to list audit logs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { actor, action, resource, result } = body;
    if (!actor || !action || !resource || !result) {
      return NextResponse.json({ error: "actor, action, resource, result are required" }, { status: 400 });
    }
    const log = await db.auditLog.create({
      data: {
        actor,
        action,
        resource,
        result,
        risk: body.risk || "low",
        details: body.details ? JSON.stringify(body.details) : null,
        ipAddress: body.ipAddress || null,
        sessionId: body.sessionId || null,
      },
    });
    return NextResponse.json(log, { status: 201 });
  } catch (error: unknown) {
    console.error("[Compliance] POST error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to create audit log" }, { status: 500 });
  }
}
