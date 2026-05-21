import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const policies = await db.compliancePolicy.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ policies, count: policies.length });
  } catch (error: unknown) {
    console.error("[Compliance/Policies] GET error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to list policies" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, ruleType, config } = body;

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const policy = await db.compliancePolicy.create({
      data: {
        name,
        description: description || "",
        ruleType: ruleType || "custom",
        config: typeof config === "string" ? config : JSON.stringify(config || {}),
        severity: body.severity || "medium",
        isEnabled: body.isEnabled !== undefined ? body.isEnabled : true,
      },
    });
    return NextResponse.json(policy, { status: 201 });
  } catch (error: unknown) {
    console.error("[Compliance/Policies] POST error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to create policy" }, { status: 500 });
  }
}
