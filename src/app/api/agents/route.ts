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
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
    const { name, role, systemPrompt, avatar, skills } = body;

    if (!name || !systemPrompt) {
      return errorResponse("Missing required fields: name, systemPrompt", 400);
    }

    if (typeof name !== "string" || typeof systemPrompt !== "string") {
      return errorResponse("Invalid field types: name and systemPrompt must be strings", 400);
    }

    const roleValue = (typeof role === "string" ? role : "assistant");
    const avatarValue = typeof avatar === "string" ? avatar : null;

    // skills must be stored as a JSON string
    const skillsValue: string | null = skills
      ? typeof skills === "string"
        ? skills
        : JSON.stringify(skills)
      : null;

    const agent = await db.agent.create({
      data: {
        name,
        role: roleValue,
        systemPrompt,
        avatar: avatarValue,
        skills: skillsValue,
      },
    });

    return NextResponse.json(agent, { status: 201 });
  } catch (error: unknown) {
    console.error("[AGENTS_POST]", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    if (errorMessage.includes("Unique constraint") || errorMessage.includes("already exists")) {
      const agentName = typeof body.name === "string" ? body.name : "unknown";
      return errorResponse(`Agent with name '${agentName}' already exists`, 409);
    }
    return errorResponse(errorMessage, 500);
  }
}
