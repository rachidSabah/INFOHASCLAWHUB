import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function resolveId(params: Promise<{ id: string }> | { id: string }) {
  const resolved = await params;
  return resolved.id;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const id = await resolveId(params);
    const agent = await db.agent.findUnique({ where: { id } });

    if (!agent) {
      return errorResponse("Agent not found", 404);
    }

    return NextResponse.json(agent);
  } catch (error) {
    console.error("[AGENT_GET]", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch agent";
    return errorResponse(errorMessage, 500);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const id = await resolveId(params);
    const body = await req.json();
    const { name, role, systemPrompt, avatar, skills, isActive } = body;

    const existing = await db.agent.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse("Agent not found", 404);
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (role !== undefined) data.role = role;
    if (systemPrompt !== undefined) data.systemPrompt = systemPrompt;
    if (avatar !== undefined) data.avatar = avatar;
    if (skills !== undefined) data.skills = skills;
    if (isActive !== undefined) data.isActive = isActive;

    if (Object.keys(data).length === 0) {
      return errorResponse("Nothing to update", 400);
    }

    const agent = await db.agent.update({
      where: { id },
      data,
    });

    return NextResponse.json(agent);
  } catch (error) {
    console.error("[AGENT_PATCH]", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to update agent";
    return errorResponse(errorMessage, 500);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const id = await resolveId(params);

    const existing = await db.agent.findUnique({ where: { id } });
    if (!existing) {
      return errorResponse("Agent not found", 404);
    }

    await db.agent.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[AGENT_DELETE]", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to delete agent";
    return errorResponse(errorMessage, 500);
  }
}
