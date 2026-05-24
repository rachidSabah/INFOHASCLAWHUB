import { WebSocketServer, WebSocket } from 'ws';

/**
 * ClawHub WebSocket Server — optional real-time transport layer
 *
 * This module provides a WebSocket server singleton that can be used
 * alongside the existing SSE (Server-Sent Events) transport. The SSE
 * fallback in `/api/gemini/chat/route.ts` continues to work regardless
 * of whether the WS server is running.
 *
 * Usage:
 *   import { getWebSocketServer } from '@/lib/websocket-server';
 *   const ws = getWebSocketServer();
 *   ws.initialize(3001);          // start listening
 *   ws.sendToSession(sid, msg);   // send JSON to a specific session
 */

interface WSClient {
  ws: WebSocket;
  sessionId: string;
  connectedAt: number;
  lastPing: number;
}

export interface WSServerStatus {
  active: boolean;
  connections: number;
  bufferedMessages: number;
  port: number | null;
}

class ClawHubWSServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WSClient> = new Map();
  private messageQueue: Map<string, string[]> = new Map(); // sessionId → buffered messages
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private currentPort: number | null = null;

  /**
   * Start the WebSocket server on the given port.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  initialize(port: number = 3001) {
    if (this.wss) return;

    try {
      this.wss = new WebSocketServer({ port });
      this.currentPort = port;

      this.wss.on('connection', (ws: WebSocket, req) => {
        const url = new URL(req.url || '/', `http://localhost`);
        const sessionId = url.searchParams.get('session') || 'unknown';

        const client: WSClient = {
          ws,
          sessionId,
          connectedAt: Date.now(),
          lastPing: Date.now(),
        };
        // If the same session reconnects, close the old socket
        const existing = this.clients.get(sessionId);
        if (existing && existing.ws.readyState === WebSocket.OPEN) {
          existing.ws.close(1000, 'Replaced by new connection');
        }
        this.clients.set(sessionId, client);

        // Deliver any messages that were buffered while the client was offline
        const queued = this.messageQueue.get(sessionId) || [];
        for (const msg of queued) {
          try { ws.send(msg); } catch { /* swallow — client may disconnect immediately */ }
        }
        this.messageQueue.delete(sessionId);

        ws.on('pong', () => {
          client.lastPing = Date.now();
        });

        ws.on('close', () => {
          this.clients.delete(sessionId);
        });

        ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(sessionId, data.toString());
        });

        console.log(`[WS] Client connected: session=${sessionId}`);
      });

      this.wss.on('error', (err) => {
        console.warn('[WS] WebSocket server error:', err.message);
      });

      // Periodic heartbeat — terminate stale clients that haven't responded to pings
      this.heartbeatInterval = setInterval(() => {
        const now = Date.now();
        this.clients.forEach((client, id) => {
          // Ping the client
          try { client.ws.ping(); } catch { /* ignore */ }

          // If no pong received in 60 s, consider the connection dead
          if (now - client.lastPing > 60_000) {
            console.log(`[WS] Terminating stale client: session=${id}`);
            try { client.ws.terminate(); } catch { /* ignore */ }
            this.clients.delete(id);
          }
        });
      }, 30_000);

      console.log(`[WS] WebSocket server started on port ${port}`);
    } catch (e) {
      console.warn('[WS] WebSocket server failed to start (SSE fallback will be used):', e);
      this.wss = null;
      this.currentPort = null;
    }
  }

  /**
   * Gracefully shut down the WebSocket server.
   */
  shutdown() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.wss) {
      // Close all connected clients
      this.clients.forEach((client) => {
        try { client.ws.close(1001, 'Server shutting down'); } catch { /* ignore */ }
      });
      this.clients.clear();

      this.wss.close(() => {
        console.log('[WS] WebSocket server shut down');
      });
      this.wss = null;
      this.currentPort = null;
    }
  }

  /**
   * Send a message (JSON string) to a specific session.
   * If the client is not connected, the message is buffered
   * (up to 100 messages) and delivered on reconnection.
   *
   * @returns `true` if the message was sent immediately, `false` if buffered.
   */
  sendToSession(sessionId: string, message: string): boolean {
    const client = this.clients.get(sessionId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message);
      return true;
    }

    // Buffer for when the client reconnects
    const queue = this.messageQueue.get(sessionId) || [];
    queue.push(message);
    if (queue.length > 100) queue.shift(); // Limit buffer size
    this.messageQueue.set(sessionId, queue);
    return false;
  }

  /**
   * Broadcast a message to all connected clients.
   */
  broadcast(message: string) {
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        try { client.ws.send(message); } catch { /* ignore */ }
      }
    });
  }

  /**
   * Check whether a given session currently has an active WebSocket connection.
   */
  isSessionConnected(sessionId: string): boolean {
    const client = this.clients.get(sessionId);
    return !!client && client.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Return a snapshot of the server status.
   */
  getStatus(): WSServerStatus {
    return {
      active: this.wss !== null,
      connections: this.clients.size,
      bufferedMessages: Array.from(this.messageQueue.values()).reduce(
        (sum, q) => sum + q.length,
        0,
      ),
      port: this.currentPort,
    };
  }

  /**
   * Handle an incoming message from a client.
   */
  private handleMessage(sessionId: string, data: string) {
    try {
      const msg = JSON.parse(data);

      switch (msg.type) {
        case 'ping': {
          const client = this.clients.get(sessionId);
          if (client) {
            client.lastPing = Date.now();
            // Respond with a pong so the client knows the server is alive
            try { client.ws.send(JSON.stringify({ type: 'pong' })); } catch { /* ignore */ }
          }
          break;
        }
        case 'cancel': {
          // Client requested generation cancellation
          // The actual cancellation logic lives in the chat route;
          // here we just acknowledge and broadcast the event.
          console.log(`[WS] Cancel requested for session=${sessionId}`);
          break;
        }
        default:
          // Unknown message type — ignore silently
          break;
      }
    } catch {
      // Not JSON or malformed — ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton — shared across the whole Node.js process
// ---------------------------------------------------------------------------
const globalForWS = globalThis as unknown as { __clawhubWSServer?: ClawHubWSServer };

let instance: ClawHubWSServer | null = null;

export function getWebSocketServer(): ClawHubWSServer {
  if (!instance) {
    // Re-use the global singleton so hot-reloading in dev doesn't create duplicates
    instance = globalForWS.__clawhubWSServer ?? null;
    if (!instance) {
      instance = new ClawHubWSServer();
      globalForWS.__clawhubWSServer = instance;
    }
  }
  return instance;
}
