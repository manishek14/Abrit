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

/** Creates a socket authenticated with the given access token. */
export function createSocket(token: string): Socket {
  return io(WS_BASE_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });
}
