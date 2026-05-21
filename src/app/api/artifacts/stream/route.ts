import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { prompt, artifactType, model = "gemini-2.0-flash" } = await req.json();

    if (!prompt) {
      return new Response(JSON.stringify({ error: "Prompt required" }), { status: 400 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const artifact = await db.artifact.create({
            data: {
              title: prompt.slice(0, 60) + "...",
              type: artifactType || "document",
              content: "",
              version: 1,
            },
          });

          await db.artifactVersion.create({
            data: {
              artifactId: artifact.id,
              version: 1,
              content: "",
              changeLog: "Started generation",
            },
          });

          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ type: "init", artifactId: artifact.id })}\n\n`)
          );

          const chatRes = await fetch(`${new URL(req.url).origin}/api/gemini/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: `Generate a comprehensive ${artifactType || "document"} based on this request: ${prompt}\n\nUse proper formatting and structure. For documents use markdown. For code artifacts provide clean code.`,
              model,
              stream: true,
            }),
          });

          if (!chatRes.ok) throw new Error(`Chat API error: ${chatRes.status}`);

          const reader = chatRes.body?.getReader();
          const decoder = new TextDecoder();
          let accumulated = "";

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const text = decoder.decode(value, { stream: true });
              const lines = text.split("\n");
              for (const line of lines) {
                if (line.startsWith("data: ")) {
                  try {
                    const chunk = JSON.parse(line.slice(6));
                    if (chunk.type === "chunk" && chunk.content) {
                      accumulated += chunk.content;
                      controller.enqueue(
                        new TextEncoder().encode(
                          `data: ${JSON.stringify({ type: "chunk", content: chunk.content, artifactId: artifact.id })}\n\n`
                        )
                      );
                    }
                  } catch {}
                }
              }
            }
          }

          await db.artifact.update({
            where: { id: artifact.id },
            data: { content: accumulated, title: prompt.slice(0, 80) },
          });

          await db.artifactVersion.updateMany({
            where: { artifactId: artifact.id, version: 1 },
            data: { content: accumulated },
          });

          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ type: "done", artifactId: artifact.id, content: accumulated })}\n\n`
            )
          );
        } catch (e: any) {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ type: "error", message: e.message })}\n\n`)
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed" }, { status: 500 });
  }
}
