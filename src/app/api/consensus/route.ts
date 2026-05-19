import { NextRequest, NextResponse } from "next/server";

interface ConsensusResult {
  model: string;
  content: string;
  tokens?: { prompt: number; completion: number };
  cost?: number;
  duration: number;
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, models } = await req.json();
    if (!prompt || !models?.length) {
      return NextResponse.json({ error: "Prompt and models required" }, { status: 400 });
    }

    const results: ConsensusResult[] = [];

    // Run all models in parallel
    const promises = models.map(async (model: string) => {
      const start = Date.now();
      try {
        const chatRes = await fetch(`${req.nextUrl.origin}/api/gemini/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            model,
            conversationHistory: [],
            stream: false,
          }),
          signal: AbortSignal.timeout(120000),
        });

        if (!chatRes.ok) {
          throw new Error(`HTTP ${chatRes.status}`);
        }

        // Read SSE stream response
        const reader = chatRes.body?.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";
        let tokens = undefined;
        let cost = undefined;

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
                    fullContent += data.content;
                  } else if (data.type === "done") {
                    tokens = data.tokens;
                    cost = data.cost;
                  }
                } catch {}
              }
            }
          }
        }

        return {
          model,
          content: fullContent || "(empty response)",
          tokens,
          cost,
          duration: Date.now() - start,
        };
      } catch (e: any) {
        return {
          model,
          content: "",
          error: e.message || "Failed",
          duration: Date.now() - start,
        };
      }
    });

    const allResults = await Promise.all(promises);
    return NextResponse.json({ results: allResults });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
