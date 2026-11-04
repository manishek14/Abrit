import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createSocket, getCurrentTicketId } from '../socket';
import { useAuth } from './AuthContext';
import { queryKeys } from '../api/keys';
import { mergeMessages } from '../utils/messages';
import type { Message, Ticket, TicketDetail, TicketStatus } from '../types';

interface SocketContextValue {
  /** True while the realtime connection is up; polling kicks in when it is not. */
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: ReactNode }): JSX.Element {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      setConnected(false);
      return;
    }

    const socket = createSocket(token);

    const invalidateTickets = (): void => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketsRoot });
    };
    const invalidateDashboard = (): void => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    };

    const applyMessage = (message: Message): void => {
      // Live-update the conversation only when it is the one on screen.
      if (getCurrentTicketId() === message.ticket_id) {
        queryClient.setQueryData<Message[]>(queryKeys.messages(message.ticket_id), (previous) =>
          previous ? mergeMessages(previous, [message]) : [message],
        );
      }
      // last_message_at / counts changed for the list + dashboard.
      invalidateTickets();
      invalidateDashboard();
    };

    socket.on('connect', () => setConnected(true));
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
