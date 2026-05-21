import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  try {
    const agents = await db.agent.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(agents);
  } catch (error: unknown) {
    console.error("[AGENTS_GET]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(errorMessage, 500);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, role, systemPrompt, avatar, skills } = body;

    if (!name || !role || !systemPrompt) {
      return errorResponse("Missing required fields: name, role, systemPrompt", 400);
    }

    if (typeof name !== "string" || typeof role !== "string" || typeof systemPrompt !== "string") {
      return errorResponse("Invalid field types: name, role, systemPrompt must be strings", 400);
    }

    // skills must be stored as a JSON string
    const skillsValue: string | null = skills
      ? typeof skills === "string"
        ? skills
        : JSON.stringify(skills)
      : null;

    const agent = await db.agent.create({
      data: {
        name,
        role,
        systemPrompt,
        avatar: avatar ?? null,
        skills: skillsValue,
      },
    });

    return NextResponse.json(agent, { status: 201 });
  } catch (error: unknown) {
    console.error("[AGENTS_POST]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(errorMessage, 500);
  }
}
