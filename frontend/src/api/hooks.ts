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
  ConversationData,
  DashboardStats,
  MessagesPage,
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

/** Page size for backward ("load older") pagination. */
const OLDER_PAGE_SIZE = 50;

/**
 * Conversation query. The merged list + hasMoreOlder live in the query cache;
 * incremental refreshes use `after=<last seen id>` so polls stay cheap.
 * Realtime events (SocketProvider) and polls merge into the same cache,
 * deduped by id. Older history is paged in separately via useLoadOlderMessages.
 */
export function useConversation(ticketId: string) {
  const { connected } = useSocket();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.messages(ticketId),
    queryFn: async (): Promise<ConversationData> => {
      const cached =
        queryClient.getQueryData<ConversationData>(queryKeys.messages(ticketId)) ??
        { messages: [], hasMoreOlder: false };
      const lastSeenId =
        cached.messages.length > 0 ? cached.messages[cached.messages.length - 1].id : null;
      const response = await api.get<MessagesPage>(`/tickets/${ticketId}/messages`, {
        params: lastSeenId ? { after: lastSeenId } : undefined,
      });
      const incoming = response.data.data;
      // `after` responses say nothing about older pages — keep the known flag;
      // full loads (no cursor) carry the server's authoritative has_more.
      const hasMoreOlder = lastSeenId
        ? cached.hasMoreOlder
        : (response.data.meta?.has_more ?? false);
      if (cached.messages.length === 0) return { messages: incoming, hasMoreOlder };
      if (incoming.length === 0) return { messages: cached.messages, hasMoreOlder }; // cheap no-op poll
      return { messages: mergeMessages(cached.messages, incoming), hasMoreOlder };
    },
    enabled: ticketId !== '',
    refetchInterval: connected ? false : POLL_INTERVAL_MS.conversation,
  });
}

/**
 * Pages in older messages (review fix): fetches the `limit` messages before
 * the oldest cached one and PREPENDS them; hasMoreOlder advances so the
 * "Load older messages" button disappears exactly when history is exhausted.
 */
export function useLoadOlderMessages(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<boolean> => {
      const current = queryClient.getQueryData<ConversationData>(queryKeys.messages(ticketId));
      const oldestId = current?.messages[0]?.id;
      if (!oldestId) return false;
      const response = await api.get<MessagesPage>(`/tickets/${ticketId}/messages`, {
        params: { before: oldestId, limit: OLDER_PAGE_SIZE },
      });
      const hasMoreOlder = response.data.meta?.has_more ?? false;
      queryClient.setQueryData<ConversationData>(queryKeys.messages(ticketId), (previous) =>
        previous
          ? {
              hasMoreOlder,
              messages: mergeMessages(response.data.data, previous.messages),
            }
          : { messages: response.data.data, hasMoreOlder },
      );
      return hasMoreOlder;
    },
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
