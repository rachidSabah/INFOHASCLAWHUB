import { NextResponse } from 'next/server';
import { getWebSocketServer } from '@/lib/websocket-server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ws/chat
 *
 * Returns the current status of the WebSocket transport and connection
 * instructions.  This endpoint does NOT perform the WebSocket upgrade
 * itself — Next.js App Router API routes do not natively support the
 * HTTP 101 upgrade handshake.  Instead, the WS server runs as a
 * separate mini-service (see `mini-services/ws-chat/`).
 *
 * The client should:
 *   1. Hit this endpoint to discover whether WS is available.
 *   2. If `status.active` is true, connect to the `connectUrl`.
 *   3. If not, fall back to SSE via the existing `/api/gemini/chat` route.
 */
export async function GET() {
  const ws = getWebSocketServer();
  const status = ws.getStatus();

  return NextResponse.json({
    transport: 'websocket',
    status,
    fallback: 'sse', // SSE is always available as a fallback
    connectUrl: status.active
      ? `ws://localhost:${status.port}/ws/chat?session=SESSION_ID`
      : null,
    note: status.active
      ? 'Connect to the WebSocket URL above for real-time chat. Replace SESSION_ID with your session identifier.'
      : 'WebSocket server is not running. SSE fallback will be used for chat streaming.',
  });
}
