import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AGENT_DEFINITIONS } from "@/lib/agent-definitions";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const def of AGENT_DEFINITIONS) {
      try {
        const skillsJson = JSON.stringify(def.skills);
        const existing = await db.agent.findFirst({
          where: { name: def.name },
        });

        if (existing) {
          await db.agent.update({
            where: { id: existing.id },
            data: {
              role: def.role,
              systemPrompt: def.systemPrompt,
              avatar: def.avatar,
              skills: skillsJson,
            },
          });
          updated++;
        } else {
          await db.agent.create({
            data: {
              name: def.name,
              role: def.role,
              systemPrompt: def.systemPrompt,
              avatar: def.avatar,
              skills: skillsJson,
            },
          });
          created++;
        }
      } catch (err: unknown) {
        errors.push(`${def.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return NextResponse.json({
      success: true,
      created,
      updated,
      total: AGENT_DEFINITIONS.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: unknown) {
    console.error("[AGENTS_SEED]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
