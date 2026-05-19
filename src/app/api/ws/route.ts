import { NextRequest, NextResponse } from "next/server";
import { eventBus } from "@/lib/events";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  const unsubs: Array<() => void> = [];
  let interval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (event: string, data: any) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {}
      };

      unsubs.push(
        eventBus.subscribe("whatsapp_message", (data) =>
          sendEvent("whatsapp_message", data)
        )
      );
      unsubs.push(
        eventBus.subscribe("whatsapp_status", (data) =>
          sendEvent("whatsapp_status", data)
        )
      );
      unsubs.push(
        eventBus.subscribe("agent_progress", (data) =>
          sendEvent("agent_progress", data)
        )
      );
      unsubs.push(
        eventBus.subscribe("system_update", (data) =>
          sendEvent("system_update", data)
        )
      );

      sendEvent("connected", {});

      interval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          if (interval) clearInterval(interval);
        }
      }, 30000);
    },
    cancel() {
      if (interval) clearInterval(interval);
      for (const unsub of unsubs) unsub();
    },
  });

  request.signal.addEventListener("abort", () => {
    if (interval) clearInterval(interval);
    for (const unsub of unsubs) unsub();
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
