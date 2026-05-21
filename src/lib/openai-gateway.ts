import { db } from "@/lib/db";

// ── Types ──

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

// ── OpenAI-Compatible Gateway ──

const globalGateway = globalThis as unknown as { __openaiGateway?: OpenAICompatibleGateway };

export class OpenAICompatibleGateway {
  static getInstance(): OpenAICompatibleGateway {
    if (!globalGateway.__openaiGateway) {
      globalGateway.__openaiGateway = new OpenAICompatibleGateway();
    }
    return globalGateway.__openaiGateway;
  }

  // ── Chat Completion (OpenAI API format) ──

  async chatCompletion(params: ChatCompletionRequest): Promise<Response> {
    const { model, messages, temperature = 0.7, max_tokens = 4096, stream = false } = params;

    try {
      // Build the prompt from messages
      const systemMsg = messages.find((m) => m.role === "system")?.content || "";
      const conversationHistory = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }));

      const lastUserMsg = messages.filter((m) => m.role === "user").pop();
      if (!lastUserMsg) {
        return new Response(
          JSON.stringify({ error: { message: "No user message provided", type: "invalid_request_error" } }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      if (stream) {
        // Return a streaming response in OpenAI SSE format
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            try {
              const res = await fetch("http://localhost:3000/api/gemini/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  prompt: lastUserMsg.content,
                  model,
                  conversationHistory,
                  systemPrompt: systemMsg,
                }),
              });

              if (!res.ok || !res.body) {
                const errorChunk = {
                  id: `chatcmpl-${Date.now()}`,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [{ index: 0, delta: {}, finish_reason: "error" }],
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
                controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                controller.close();
                return;
              }

              const reader = res.body.getReader();
              const decoder = new TextDecoder();
              const chatId = `chatcmpl-${Date.now()}`;

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = decoder.decode(value, { stream: true });
                const lines = text.split("\n");

                for (const line of lines) {
                  if (line.startsWith("data: ")) {
                    try {
                      const data = JSON.parse(line.slice(6));
                      if (data.type === "chunk" && data.content) {
                        const chunk = {
                          id: chatId,
                          object: "chat.completion.chunk",
                          created: Math.floor(Date.now() / 1000),
                          model,
                          choices: [
                            { index: 0, delta: { content: data.content }, finish_reason: null },
                          ],
                        };
                        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
                      }
                    } catch { /* skip unparseable lines */ }
                  }
                }
              }

              // Send final chunk
              const finalChunk = {
                id: chatId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            } catch (error: unknown) {
              const errorChunk = {
                id: `chatcmpl-${Date.now()}`,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ index: 0, delta: { content: `[Error] ${error instanceof Error ? error.message : "Stream failed"}` }, finish_reason: "stop" }],
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
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
      }

      // Non-streaming: accumulate full response
      const res = await fetch("http://localhost:3000/api/gemini/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: lastUserMsg.content,
          model,
          conversationHistory,
          systemPrompt: systemMsg,
        }),
      });

      let accumulated = "";
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          for (const line of text.split("\n")) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "chunk") accumulated += data.content || "";
              } catch { /* skip */ }
            }
          }
        }
      }

      const completion = {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
          {
            index: 0,
            message: { role: "assistant" as const, content: accumulated },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      };

      return new Response(JSON.stringify(completion), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error: unknown) {
      const errorResp = {
        error: {
          message: error instanceof Error ? error.message : "Internal server error",
          type: "internal_error",
          code: "internal_error",
        },
      };
      return new Response(JSON.stringify(errorResp), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // ── List Models (OpenAI API format) ──

  async listModels(): Promise<Array<{ id: string; object: string; created: number; owned_by: string }>> {
    const builtInModels = [
      { id: "auto", object: "model", created: 1700000000, owned_by: "clawhub" },
      { id: "gemini-2.5-pro", object: "model", created: 1700000000, owned_by: "google" },
      { id: "gemini-2.5-flash", object: "model", created: 1700000000, owned_by: "google" },
      { id: "gemini-3.1-pro", object: "model", created: 1700000000, owned_by: "google" },
      { id: "gemini-3-flash", object: "model", created: 1700000000, owned_by: "google" },
      { id: "deepseek-chat", object: "model", created: 1700000000, owned_by: "deepseek" },
      { id: "deepseek-reasoner", object: "model", created: 1700000000, owned_by: "deepseek" },
      { id: "gpt-4o", object: "model", created: 1700000000, owned_by: "openai" },
      { id: "claude-sonnet-4", object: "model", created: 1700000000, owned_by: "anthropic" },
    ];

    try {
      // Also include any providers from DB
      const providers = await db.provider.findMany({ where: { isActive: true } });
      for (const p of providers) {
        if (!builtInModels.find((m) => m.id === p.name)) {
          builtInModels.push({
            id: p.name,
            object: "model",
            created: Math.floor(new Date(p.createdAt).getTime() / 1000),
            owned_by: p.name,
          });
        }
      }
    } catch { /* ignore DB errors */ }

    return builtInModels;
  }
}

export function getOpenAICompatibleGateway(): OpenAICompatibleGateway {
  return OpenAICompatibleGateway.getInstance();
}
