import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { taskId } = body;

    if (!taskId) {
      return NextResponse.json({ error: "taskId is required" }, { status: 400 });
    }

    const task = await db.cronTask.findUnique({ where: { id: taskId } });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // Parse config to get prompt and model info
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(task.config);
    } catch {
      config = {};
    }

    const prompt = (config.prompt as string) || task.description || task.name;
    const model = (config.model as string) || "gemini-2.5-flash";

    const conv = await db.conversation.create({
      data: {
        title: `[Scheduled] ${task.name}`,
        model,
        systemPrompt: null,
      },
    });

    const userMsg = await db.message.create({
      data: {
        conversationId: conv.id,
        role: "user",
        content: prompt,
        agentId: task.agentId || null,
        metadata: JSON.stringify({ scheduled: true, taskId: task.id, taskName: task.name }),
      },
    });

    let assistantContent = "";
    let runError: string | undefined;

    try {
      const chatRes = await fetch(`${req.nextUrl.origin}/api/gemini/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          model,
          agentId: task.agentId || undefined,
          conversationHistory: [],
        }),
      });

      if (!chatRes.ok) {
        throw new Error(`Chat API returned ${chatRes.status}`);
      }

      const reader = chatRes.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "chunk") {
                  assistantContent += data.content;
                } else if (data.type === "error") {
                  runError = data.error;
                }
              } catch {
                // Ignore malformed SSE lines
              }
            }
          }
        }
      }

      if (runError) throw new Error(runError);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      runError = errMsg;
      assistantContent = `[Error] ${errMsg}`;
    }

    const assistantMsg = await db.message.create({
      data: {
        conversationId: conv.id,
        role: "assistant",
        content: assistantContent,
        agentId: task.agentId || null,
        metadata: JSON.stringify({ scheduled: true, taskId: task.id, taskName: task.name }),
      },
    });

    // Update the cron task with run results
    const now = new Date();
    const newRunCount = task.runCount + 1;
    const newFailCount = task.failCount + (runError ? 1 : 0);

    await db.cronTask.update({
      where: { id: task.id },
      data: {
        lastRunAt: now,
        lastResult: JSON.stringify({
          success: !runError,
          output: assistantContent.slice(0, 500),
          conversationId: conv.id,
        }),
        runCount: newRunCount,
        failCount: newFailCount,
      },
    });

    return NextResponse.json({
      success: !runError,
      conversationId: conv.id,
      result: assistantContent.slice(0, 500),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
