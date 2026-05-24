import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      cardId: string;
      agentId: string;
      model?: string;
    };

    if (!body.cardId || !body.agentId) {
      return NextResponse.json({ error: "cardId and agentId are required" }, { status: 400 });
    }

    // Fetch the kanban card with its column info
    const card = await db.kanbanCard.findUnique({
      where: { id: body.cardId },
      include: { column: true },
    });

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    // Fetch the agent
    const agent = await db.agent.findUnique({ where: { id: body.agentId } });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Build the execution prompt from the card details
    const prompt = [
      `Task: ${card.title}`,
      card.description ? `Description: ${card.description}` : "",
      card.priority ? `Priority: ${card.priority}` : "",
      `Status: ${card.column.name}`,
    ]
      .filter(Boolean)
      .join("\n");

    const model = body.model || "gemini-2.5-flash";

    // Execute the agent via the internal API
    const response = await fetch("http://localhost:3000/api/agents/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: agent.id,
        task: prompt,
        model,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "Unknown error");
      return NextResponse.json(
        { error: `Agent execution failed: ${errText.slice(0, 200)}` },
        { status: 500 }
      );
    }

    const result = await response.json();

    // Update card status to indicate execution
    await db.kanbanCard.update({
      where: { id: body.cardId },
      data: { status: "executing" },
    });

    return NextResponse.json({
      success: true,
      cardId: body.cardId,
      agentId: agent.id,
      agentName: agent.name,
      model,
      result,
    }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to execute kanban card";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
