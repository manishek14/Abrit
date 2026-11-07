/**
 * Shared API types. Field names mirror the backend payloads exactly
 * (snake_case); do not rename without updating the API contract.
 */

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'ANSWERED' | 'CLOSED';

export type TicketDepartment = 'FINANCE' | 'SUPPORT' | 'TECHNICAL' | 'SUGGESTIONS';

export type MessageRole = 'USER' | 'ASSISTANT' | 'ADMIN' | 'SYSTEM';

export type DeliveryStatus = 'PENDING' | 'SENT' | 'FAILED';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
}

export interface LoginResponse {
  accessToken: string;
  admin: AdminUser;
}

export interface DashboardStats {
  tickets: {
    total: number;
    open: number;
    inProgress: number;
    answered: number;
    closed: number;
    today: number;
  };
  users: {
    total: number;
  };
  timezone: string;
  updatedAt: string;
}

export interface TelegramUser {
  id: string;
  telegram_id: string;
  chat_id: string | null;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string | null;
  is_blocked: boolean;
  /** Mandatory-registration profile (feature round) — null until completed. */
  full_name: string | null;
  phone: string | null;
  profile_completed_at: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
  /** Present on user list responses; may be absent when embedded elsewhere. */
  ticket_count?: number;
}

export interface TelegramUserWithTickets extends TelegramUser {
  tickets: Ticket[];
}

export interface Ticket {
  id: string;
  ticket_number: string;
  user_id: string;
  status: TicketStatus;
  subject: string | null;
  /** Department chosen in the bot's ticket wizard; NULL for legacy rows. */
  department: TicketDepartment | null;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  closed_at: string | null;
}

/** List items may additionally embed the ticket owner, depending on the serializer. */
export type TicketListItem = Ticket & { user?: TelegramUser };

export interface TicketDetail extends Ticket {
  user: TelegramUser;
}

export interface MessageMeta {
  provider?: string;
  model?: string;
  latencyMs?: number;
  attempts?: number;
  reason?: string;
  [key: string]: unknown;
}

export interface Message {
  /** bigint identity — always arrives serialized as a string. */
  id: string;
  ticket_id: string;
  role: MessageRole;
  content: string;
  delivery_status: DeliveryStatus | null;
  delivery_attempts: number;
  error: string | null;
  telegram_message_id: string | null;
  admin_id: string | null;
  meta: MessageMeta | null;
  created_at: string;
  sent_at: string | null;
}

export interface PaginatedMeta {
  page: number;
  limit: number;
  total: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginatedMeta;
}

/** GET /tickets/:id/messages response envelope. */
export interface MessagesPage {
  data: Message[];
  meta: { has_more: boolean };
}

/**
 * The conversation query cache shape: the merged chronological message list
 * plus `hasMoreOlder` — whether older history can be paged in with ?before=.
 */
export interface ConversationData {
  messages: Message[];
  hasMoreOlder: boolean;
}

export interface TicketsFilters {
  status: TicketStatus | '';
  q: string;
  page: number;
  limit: number;
}

export interface UsersFilters {
  q: string;
  page: number;
  limit: number;
}

export interface TicketStatusChangeResult {
  ticket: Ticket;
  systemMessage: Message | null;
  changed: boolean;
}

export interface AssistantSettings {
  id: number;
  system_prompt: string;
  model: string;
  is_active: boolean;
  updated_by_admin_id: string | null;
  updated_at: string;
}

export interface AssistantModel {
  id: string;
  label: string;
}

export interface AssistantModelsResponse {
  models: AssistantModel[];
  source: 'openrouter' | 'fallback';
  fetchedAt?: string;
}

export interface UpdateAssistantSettingsPayload {
  system_prompt?: string;
  model?: string;
  is_active?: boolean;
}
