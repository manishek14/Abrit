import type { TicketsFilters, UsersFilters } from '../types';

/**
 * Central query-key registry. Keys starting with 'tickets', 'users', etc.
 * are invalidated by prefix, so list and detail queries refresh together.
 */
export const queryKeys = {
  dashboard: ['dashboard'] as const,
  ticketsRoot: ['tickets'] as const,
  ticketsList: (filters: TicketsFilters): readonly unknown[] => ['tickets', 'list', filters],
  ticket: (id: string): readonly unknown[] => ['tickets', 'detail', id],
  messages: (ticketId: string): readonly unknown[] => ['messages', ticketId],
  usersRoot: ['users'] as const,
  usersList: (filters: UsersFilters): readonly unknown[] => ['users', 'list', filters],
  user: (id: string): readonly unknown[] => ['users', 'detail', id],
  settings: ['settings', 'assistant'] as const,
  models: ['settings', 'assistant', 'models'] as const,
} as const;
