"use client";

import { useEffect, useRef, useCallback } from "react";

interface SSECallback {
  (event: string, data: any): void;
}

export function useSSE(callback: SSECallback) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    const host = window.location.host;
    const url = `${protocol}//${host}/api/ws`;
    const es = new EventSource(url);

    es.onopen = () => {
      callbackRef.current("__open__", {});
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        callbackRef.current("message", data);
      } catch {}
    };

    const events = ["connected", "whatsapp_message", "whatsapp_status", "agent_progress", "system_update"];
    for (const evt of events) {
      es.addEventListener(evt, (event: any) => {
        try {
          callbackRef.current(evt, JSON.parse(event.data));
        } catch {
          callbackRef.current(evt, event.data);
        }
      });
    }

    es.onerror = () => {
      callbackRef.current("__error__", {});
      es.close();
    };

    eventSourceRef.current = es;

    return () => {
      es.close();
    };
  }, []);

  useEffect(() => {
    const cleanup = connect();
    return () => cleanup();
  }, [connect]);

  const reconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    connect();
  }, [connect]);

  return { reconnect };
}
