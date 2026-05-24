'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Configuration options for the useWebSocket hook.
 */
interface UseWebSocketOptions {
  /** Full WebSocket URL (without query params). Defaults to the WS mini-service. */
  url?: string;
  /** Session identifier — appended as `?session=<id>` on the WS URL. */
  sessionId: string;
  /** Callback invoked for each parsed JSON message received from the server. */
  onMessage?: (data: any) => void;
  /** Callback invoked when the WebSocket connection is established. */
  onConnect?: () => void;
  /** Callback invoked when the WebSocket connection is lost. */
  onDisconnect?: () => void;
  /** Whether to automatically reconnect on disconnect (default: true). */
  autoReconnect?: boolean;
  /** Maximum number of reconnection attempts before giving up (default: Infinity). */
  maxReconnectAttempts?: number;
  /** Base delay in ms between reconnection attempts (default: 3000). Doubles on each failure. */
  reconnectBaseDelay?: number;
  /** Whether to attempt connection on mount (default: true). Set to false for manual control. */
  connectOnMount?: boolean;
}

export interface UseWebSocketReturn {
  /** Whether the WebSocket connection is currently open. */
  isConnected: boolean;
  /** Number of consecutive reconnection attempts made (resets on successful connect). */
  reconnectAttempts: number;
  /** Send a JSON-serialisable object to the server. Returns `true` if sent, `false` if not connected. */
  send: (data: any) => boolean;
  /** Manually open the connection. */
  connect: () => void;
  /** Manually close the connection and stop auto-reconnecting. */
  disconnect: () => void;
}

/**
 * React hook for managing a WebSocket connection to the ClawHub
 * real-time chat transport.
 *
 * The hook is designed to be *optional* — if the WebSocket server is
 * unavailable the consumer should fall back to SSE via the existing
 * `/api/gemini/chat` route.
 *
 * Example:
 * ```tsx
 * const { isConnected, send, disconnect } = useWebSocket({
 *   sessionId: conversationId,
 *   onMessage: (data) => {
 *     if (data.type === 'chunk') appendContent(data.content);
 *   },
 * });
 * ```
 */
export function useWebSocket({
  url,
  sessionId,
  onMessage,
  onConnect,
  onDisconnect,
  autoReconnect = true,
  maxReconnectAttempts = Infinity,
  reconnectBaseDelay = 3000,
  connectOnMount = true,
}: UseWebSocketOptions): UseWebSocketReturn {
  // Resolve WS URL — prefer the mini-service (port 3001) through the gateway
  const wsUrl = url ?? `ws://localhost:3001/ws/chat`;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalCloseRef = useRef(false);

  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  // Stable refs for callbacks so they don't cause re-connects on identity changes
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onConnectRef = useRef(onConnect);
  onConnectRef.current = onConnect;
  const onDisconnectRef = useRef(onDisconnect);
  onDisconnectRef.current = onDisconnect;

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    // Close any existing connection first
    if (wsRef.current) {
      try { wsRef.current.close(); } catch { /* ignore */ }
      wsRef.current = null;
    }

    intentionalCloseRef.current = false;

    try {
      const fullUrl = `${wsUrl}?session=${encodeURIComponent(sessionId)}`;
      const ws = new WebSocket(fullUrl);

      ws.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        setReconnectAttempts(0);
        onConnectRef.current?.();
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data as string);
          onMessageRef.current?.(data);
        } catch {
          // Non-JSON message — ignore
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        onDisconnectRef.current?.();

        // Auto-reconnect with exponential backoff (unless intentionally closed)
        if (
          autoReconnect &&
          !intentionalCloseRef.current &&
          reconnectAttemptsRef.current < maxReconnectAttempts
        ) {
          const delay = reconnectBaseDelay * Math.pow(2, Math.min(reconnectAttemptsRef.current, 5));
          reconnectAttemptsRef.current += 1;
          setReconnectAttempts(reconnectAttemptsRef.current);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        // Let onclose handle the cleanup — closing here triggers onclose
        try { ws.close(); } catch { /* ignore */ }
      };

      wsRef.current = ws;
    } catch {
      // WebSocket constructor may throw in environments that don't support it.
      // That's fine — SSE fallback will be used.
    }
  }, [wsUrl, sessionId, autoReconnect, maxReconnectAttempts, reconnectBaseDelay]);

  const send = useCallback((data: any): boolean => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    clearReconnectTimeout();
    if (wsRef.current) {
      try { wsRef.current.close(1000, 'Client disconnect'); } catch { /* ignore */ }
      wsRef.current = null;
    }
    setIsConnected(false);
  }, [clearReconnectTimeout]);

  // Auto-connect on mount and when sessionId changes
  useEffect(() => {
    if (connectOnMount && sessionId) {
      connect();
    }
    return () => {
      intentionalCloseRef.current = true;
      clearReconnectTimeout();
      if (wsRef.current) {
        try { wsRef.current.close(1000, 'Component unmount'); } catch { /* ignore */ }
        wsRef.current = null;
      }
    };
    // We intentionally only depend on sessionId so that reconnects
    // happen when the conversation changes.
  }, [sessionId, connectOnMount]);

  return { isConnected, reconnectAttempts, send, connect, disconnect };
}
