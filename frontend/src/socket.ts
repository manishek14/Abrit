import { io, type Socket } from 'socket.io-client';
import { WS_BASE_URL } from './api/client';

/**
 * Which ticket conversation is currently on screen (null = none).
 * The SocketProvider reads this to decide whether incoming
 * `message:*` events should be merged into the visible conversation.
 */
let currentTicketId: string | null = null;

export function setCurrentTicketId(ticketId: string | null): void {
  currentTicketId = ticketId;
}

export function getCurrentTicketId(): string | null {
  return currentTicketId;
}

/**
 * Creates a socket authenticated with the HttpOnly session cookie (round 6):
 * the browser attaches `abrit_session` to the handshake automatically, so the
 * raw token never reaches JavaScript. `withCredentials` is what makes the
 * cross-origin (dev) handshake carry the cookie.
 */
export function createSocket(): Socket {
  return io(WS_BASE_URL, {
    withCredentials: true,
    // Polling first: on Vercel (vercel.json rewrite) the WebSocket upgrade is
    // not proxied, and engine.io does NOT auto-fall-back to another transport
    // unless `tryAllTransports` is set — websocket-first would never connect.
    // Polling connects through the rewrite immediately; engine.io still probes
    // a websocket upgrade afterwards (native proxy deployments upgrade, Vercel
    // stays on polling).
    transports: ['polling', 'websocket'],
  });
}
