import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './keys';
import { useSocket } from '../context/SocketContext';
import { mergeMessages } from '../utils/messages';
import type {
  AssistantModelsResponse,
  AssistantSettings,
  DashboardStats,
  Message,
  Paginated,
  TelegramUser,
  TelegramUserWithTickets,
  TicketDetail,
  TicketListItem,
  TicketStatus,
  TicketStatusChangeResult,
  TicketsFilters,
  UpdateAssistantSettingsPayload,
  UsersFilters,
} from '../types';

/**
 * Polling fallback intervals (ms), active only while the realtime socket is
 * offline (or has not connected yet). While the socket is connected these
 * are all disabled and WebSocket events drive freshness instead.
 */
export const POLL_INTERVAL_MS = {
  dashboard: 30_000,
  ticketsList: 15_000,
  conversation: 5_000,
} as const;

/* ------------------------------------------------------------------ */
/* Dashboard                                                            */
/* ------------------------------------------------------------------ */

export function useDashboardStats() {
  const { connected } = useSocket();
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: async (): Promise<DashboardStats> => {
      const response = await api.get<{ data: DashboardStats }>('/dashboard/stats');
      return response.data.data;
    },
    refetchInterval: connected ? false : POLL_INTERVAL_MS.dashboard,
  });
}

/* ------------------------------------------------------------------ */
/* Tickets                                                              */
/* ------------------------------------------------------------------ */

export function useTickets(filters: TicketsFilters) {
  const { connected } = useSocket();
  return useQuery({
    queryKey: queryKeys.ticketsList(filters),
    queryFn: async (): Promise<Paginated<TicketListItem>> => {
      const response = await api.get<Paginated<TicketListItem>>('/tickets', {
        params: {
          page: filters.page,
          limit: filters.limit,
          status: filters.status || undefined,
          q: filters.q.trim() || undefined,
        },
      });
      return response.data;
    },
    placeholderData: keepPreviousData,
    refetchInterval: connected ? false : POLL_INTERVAL_MS.ticketsList,
  });
}

export function useTicket(ticketId: string) {
  return useQuery({
    queryKey: queryKeys.ticket(ticketId),
    queryFn: async (): Promise<TicketDetail> => {
      const response = await api.get<{ data: TicketDetail }>(`/tickets/${ticketId}`);
      return response.data.data;
    },
    enabled: ticketId !== '',
  });
}

/**
 * Conversation query. The full list lives in the query cache; incremental
 * refreshes use `after=<last seen id>` so polls stay cheap. Realtime events
 * (SocketProvider) and polls merge into the same cache, deduped by id.
 */
export function useConversation(ticketId: string) {
  const { connected } = useSocket();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.messages(ticketId),
    queryFn: async (): Promise<Message[]> => {
      const cached = queryClient.getQueryData<Message[]>(queryKeys.messages(ticketId)) ?? [];
      const lastSeenId = cached.length > 0 ? cached[cached.length - 1].id : null;
      const response = await api.get<{ data: Message[] }>(`/tickets/${ticketId}/messages`, {
        params: lastSeenId ? { after: lastSeenId } : undefined,
      });
      const incoming = response.data.data;
      if (cached.length === 0) return incoming;
      if (incoming.length === 0) return cached; // cheap no-op poll
      return mergeMessages(cached, incoming);
    },
    enabled: ticketId !== '',
    refetchInterval: connected ? false : POLL_INTERVAL_MS.conversation,
  });
}

export function useChangeTicketStatus(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (status: TicketStatus): Promise<TicketStatusChangeResult> => {
      const response = await api.patch<{ data: TicketStatusChangeResult }>(
        `/tickets/${ticketId}/status`,
        { status },
      );
      return response.data.data;
    },
    onSuccess: () => {
      // Detail + conversation (a SYSTEM message may be added), list, dashboard.
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticketId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages(ticketId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.ticketsRoot });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

export function useUsers(filters: UsersFilters) {
  return useQuery({
    queryKey: queryKeys.usersList(filters),
    queryFn: async (): Promise<Paginated<TelegramUser>> => {
      const response = await api.get<Paginated<TelegramUser>>('/users', {
        params: {
          page: filters.page,
          limit: filters.limit,
          q: filters.q.trim() || undefined,
        },
      });
      return response.data;
    },
    placeholderData: keepPreviousData,
  });
}

export function useUser(userId: string) {
  return useQuery({
    queryKey: queryKeys.user(userId),
    queryFn: async (): Promise<TelegramUserWithTickets> => {
      const response = await api.get<{ data: TelegramUserWithTickets }>(`/users/${userId}`);
      return response.data.data;
    },
    enabled: userId !== '',
  });
}

/* ------------------------------------------------------------------ */
/* Assistant settings                                                   */
/* ------------------------------------------------------------------ */

export function useAssistantSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: async (): Promise<AssistantSettings> => {
      const response = await api.get<{ data: AssistantSettings }>('/settings/assistant');
      return response.data.data;
    },
  });
}

export function useAssistantModels() {
  return useQuery({
    queryKey: queryKeys.models,
    queryFn: async (): Promise<AssistantModelsResponse> => {
      const response = await api.get<{ data: AssistantModelsResponse }>('/settings/assistant/models');
      return response.data.data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useUpdateAssistantSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: UpdateAssistantSettingsPayload,
    ): Promise<AssistantSettings> => {
      const response = await api.patch<{ data: AssistantSettings }>('/settings/assistant', payload);
      return response.data.data;
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.settings, settings);
    },
  });
}
