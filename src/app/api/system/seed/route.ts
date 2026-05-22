import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seedPreconfiguredSystem } from "@/lib/preconfigured-system";

export const dynamic = "force-dynamic";

// ── POST: Seed the entire preconfigured system ──────────────────────────────
export async function POST() {
  try {
    const summary = await seedPreconfiguredSystem();
    return NextResponse.json({ success: true, summary });
  } catch (error: unknown) {
    console.error("[SYSTEM_SEED_POST]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

// ── GET: Return current seed status (counts) ───────────────────────────────
export async function GET() {
  try {
    const [agents, pipelines, providers, routes, templates] = await Promise.all([
      db.agent.count(),
      db.agentPipeline.count(),
      db.providerScore.count(),
      db.modelRoute.count(),
      db.promptTemplate.count(),
    ]);

    return NextResponse.json({
      seeded: true,
      counts: { agents, pipelines, providers, routes, templates },
    });
  } catch (error: unknown) {
    console.error("[SYSTEM_SEED_GET]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// ── DELETE: Reset the system (delete all seeded data) ───────────────────────
export async function DELETE() {
  try {
    // Delete in dependency order to respect foreign-key constraints
    await db.promptTemplate.deleteMany();
    await db.modelRoute.deleteMany();
    await db.providerScore.deleteMany();
    await db.agentPipeline.deleteMany();
    await db.agent.deleteMany();

    return NextResponse.json({ success: true, message: "All seeded data has been deleted." });
  } catch (error: unknown) {
    console.error("[SYSTEM_SEED_DELETE]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
