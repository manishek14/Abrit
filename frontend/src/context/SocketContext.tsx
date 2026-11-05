import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createSocket, getCurrentTicketId } from '../socket';
import { useAuth } from './AuthContext';
import { queryKeys } from '../api/keys';
import { mergeMessages } from '../utils/messages';
import type { ConversationData, Message, Ticket, TicketDetail, TicketStatus } from '../types';

interface SocketContextValue {
  /** True while the realtime connection is up; polling kicks in when it is not. */
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }): JSX.Element {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  // Whether this socket instance had at least one successful connection — used
  // to distinguish the FIRST connect (nothing to resync) from a RE-connect
  // (events were missed while offline → caches must be revalidated).
  const hadConnectionRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setConnected(false);
      return;
    }

    const socket = createSocket(token);
    hadConnectionRef.current = false;

    const invalidateTickets = (): void => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketsRoot });
    };
    const invalidateDashboard = (): void => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    };
    const invalidateUsers = (): void => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.usersRoot });
    };

    const applyMessage = (message: Message): void => {
      // Live-update the conversation only when it is the one on screen.
      if (getCurrentTicketId() === message.ticket_id) {
        queryClient.setQueryData<ConversationData>(queryKeys.messages(message.ticket_id), (previous) =>
          previous
            ? { hasMoreOlder: previous.hasMoreOlder, messages: mergeMessages(previous.messages, [message]) }
            : { messages: [message], hasMoreOlder: false },
        );
      }
      // last_message_at / counts changed for the list + dashboard.
      invalidateTickets();
      invalidateDashboard();
    };

    socket.on('connect', () => {
      setConnected(true);
      if (hadConnectionRef.current) {
        // RE-connect (review fix): every event emitted while the socket was
        // down is gone for good — refetch ALL queries so the panel shows the
        // missed tickets/messages/users instead of stale caches.
        void queryClient.invalidateQueries();
      }
      hadConnectionRef.current = true;
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (err: Error) => {
      setConnected(false);
      console.debug('[socket] connection error:', err.message);
    });

    socket.on('ticket:new', (_payload: { ticket: Ticket }) => {
      invalidateTickets();
      invalidateDashboard();
    });

    socket.on('ticket:updated', (payload: { ticket: Ticket; previousStatus: TicketStatus }) => {
      invalidateTickets();
      invalidateDashboard();
      // Optimistically patch the detail cache (if cached) for an instant status flip.
      queryClient.setQueryData<TicketDetail>(queryKeys.ticket(payload.ticket.id), (previous) =>
        previous ? { ...previous, ...payload.ticket, user: previous.user } : previous,
      );
    });

    socket.on('message:new', (payload: { message: Message }) => {
      applyMessage(payload.message);
    });

    socket.on('message:updated', (payload: { message: Message }) => {
      applyMessage(payload.message);
    });

    // A user wrote to the bot for the first time → the users list gains a row
    // (review fix: the list used to stay stale until a manual refresh).
    socket.on('user:new', (_payload: { user: unknown }) => {
      invalidateUsers();
      invalidateDashboard();
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      setConnected(false);
    };
  }, [token, queryClient]);

  const value = useMemo<SocketContextValue>(() => ({ connected }), [connected]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket(): SocketContextValue {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
