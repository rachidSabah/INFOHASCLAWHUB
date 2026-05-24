/**
 * ClawHub WebSocket Chat Mini-Service
 *
 * Standalone WebSocket server that provides real-time chat transport.
 * Runs on port 3001 and is accessed through the Caddy gateway via
 * `?XTransformPort=3001`.
 *
 * This is the **optional** companion to the primary SSE-based chat
 * transport.  If this service is not running, the client falls back
 * to SSE automatically.
 *
 * Protocol:
 *   Client → Server:
 *     { "type": "ping" }
 *     { "type": "cancel" }
 *     { "type": "chat", "payload": { ... } }
 *
 *   Server → Client:
 *     { "type": "pong" }
 *     { "type": "chunk", "content": "..." }
 *     { "type": "tool_call", "toolName": "..." }
 *     { "type": "tool_result", "toolName": "...", "result": "..." }
 *     { "type": "reasoning", "content": "..." }
 *     { "type": "done", "duration": ..., "tokens": ..., "cost": ... }
 *     { "type": "error", "error": "..." }
 */

import { WebSocketServer, WebSocket } from 'ws';

const PORT = 3001;

// ---------------------------------------------------------------------------
// Client tracking
// ---------------------------------------------------------------------------
interface WSClient {
  ws: WebSocket;
  sessionId: string;
  connectedAt: number;
  lastPing: number;
}

const clients: Map<string, WSClient> = new Map();
const messageQueue: Map<string, string[]> = new Map();

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ port: PORT });

wss.on('listening', () => {
  console.log(`[WS Chat] WebSocket server listening on port ${PORT}`);
});

wss.on('error', (err) => {
  console.error(`[WS Chat] Server error:`, err);
});

wss.on('connection', (ws: WebSocket, req) => {
  const url = new URL(req.url || '/', `http://localhost`);
  const sessionId = url.searchParams.get('session') || 'unknown';

  // Close any existing connection for this session (single-connection-per-session model)
  const existing = clients.get(sessionId);
  if (existing && existing.ws.readyState === WebSocket.OPEN) {
    existing.ws.close(1000, 'Replaced by new connection');
  }

  const client: WSClient = {
    ws,
    sessionId,
    connectedAt: Date.now(),
    lastPing: Date.now(),
  };
  clients.set(sessionId, client);

  // Deliver buffered messages
  const queued = messageQueue.get(sessionId) || [];
  for (const msg of queued) {
    try { ws.send(msg); } catch { /* ignore */ }
  }
  messageQueue.delete(sessionId);

  console.log(`[WS Chat] Client connected: session=${sessionId} (total: ${clients.size})`);

  // --- Event handlers -------------------------------------------------------

  ws.on('pong', () => {
    client.lastPing = Date.now();
  });

  ws.on('close', (code, reason) => {
    clients.delete(sessionId);
    console.log(`[WS Chat] Client disconnected: session=${sessionId} code=${code} (total: ${clients.size})`);
  });

  ws.on('message', (data: WebSocket.Data) => {
    const raw = data.toString();
    try {
      const msg = JSON.parse(raw);
      handleMessage(sessionId, msg);
    } catch {
      // Not JSON — ignore
    }
  });
});

// ---------------------------------------------------------------------------
// Heartbeat — prune stale connections every 30 s
// ---------------------------------------------------------------------------
setInterval(() => {
  const now = Date.now();
  clients.forEach((client, id) => {
    try { client.ws.ping(); } catch { /* ignore */ }

    if (now - client.lastPing > 60_000) {
      console.log(`[WS Chat] Terminating stale client: session=${id}`);
      try { client.ws.terminate(); } catch { /* ignore */ }
      clients.delete(id);
    }
  });
}, 30_000);

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
function handleMessage(sessionId: string, msg: any) {
  switch (msg.type) {
    case 'ping': {
      const client = clients.get(sessionId);
      if (client) {
        client.lastPing = Date.now();
        try { client.ws.send(JSON.stringify({ type: 'pong' })); } catch { /* ignore */ }
      }
      break;
    }
    case 'cancel': {
      console.log(`[WS Chat] Cancel requested for session=${sessionId}`);
      // Acknowledge the cancellation
      const client = clients.get(sessionId);
      if (client) {
        try { client.ws.send(JSON.stringify({ type: 'cancelled' })); } catch { /* ignore */ }
      }
      break;
    }
    case 'chat': {
      // A client-initiated chat message.  In the current architecture
      // the actual LLM call still happens via the HTTP SSE route, but
      // we can proxy the result back through WebSocket for consumers
      // that prefer a WS-only flow.  For now we just acknowledge.
      const client = clients.get(sessionId);
      if (client) {
        try {
          client.ws.send(JSON.stringify({
            type: 'ack',
            message: 'Chat request received. Use the HTTP API for LLM inference; WS is for push delivery.',
          }));
        } catch { /* ignore */ }
      }
      break;
    }
    default:
      // Unknown message — ignore
      break;
  }
}

// ---------------------------------------------------------------------------
// Helpers (exported for potential test use or future extension)
// ---------------------------------------------------------------------------

/**
 * Send a JSON string to a specific session.
 * Buffers the message if the client is not currently connected.
 */
function sendToSession(sessionId: string, message: string): boolean {
  const client = clients.get(sessionId);
  if (client && client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(message);
    return true;
  }

  // Buffer for later delivery
  const queue = messageQueue.get(sessionId) || [];
  queue.push(message);
  if (queue.length > 100) queue.shift();
  messageQueue.set(sessionId, queue);
  return false;
}

/**
 * Broadcast a JSON string to all connected clients.
 */
function broadcast(message: string) {
  clients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      try { client.ws.send(message); } catch { /* ignore */ }
    }
  });
}

// ---------------------------------------------------------------------------
// Status endpoint (accessible via HTTP for health checks)
// ---------------------------------------------------------------------------
import { createServer } from 'http';

const statusServer = createServer((req, res) => {
  if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      transport: 'websocket',
      active: true,
      connections: clients.size,
      bufferedMessages: Array.from(messageQueue.values()).reduce((sum, q) => sum + q.length, 0),
      port: PORT,
    }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

statusServer.listen(PORT + 1, () => {
  console.log(`[WS Chat] Status endpoint listening on port ${PORT + 1}`);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------
function shutdown() {
  console.log('[WS Chat] Shutting down...');
  clients.forEach((client) => {
    try { client.ws.close(1001, 'Server shutting down'); } catch { /* ignore */ }
  });
  clients.clear();
  wss.close();
  statusServer.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
