import dayjs from 'dayjs';
import type { TelegramUser } from '../types';

/** first+last name → username → telegram id → fallback. */
export function userDisplayName(user: TelegramUser): string {
  const name = [user.first_name, user.last_name]
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .trim();
  if (name.length > 0) return name;
  if (user.username) return `@${user.username}`;
  if (user.telegram_id) return `TG ${user.telegram_id}`;
  return 'Unknown user';
}

/** Label for the ticket "User" column — tolerates a missing embedded user. */
export function ticketUserLabel(user: TelegramUser | undefined, fallbackUserId: string): string {
  if (user) return userDisplayName(user);
  return `User ${fallbackUserId.slice(0, 8)}`;
}

/** '—' for nullish values, full local timestamp otherwise. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return dayjs(iso).format('YYYY-MM-DD HH:mm:ss');
}

/** Short time for chat bubbles; includes the date when the message is old. */
export function formatTimeShort(iso: string): string {
  const time = dayjs(iso);
  return time.isSame(dayjs(), 'day') ? time.format('HH:mm') : time.format('MMM D, HH:mm');
}

/** 'openrouter/gpt-4o-mini' → 'gpt-4o-mini' for tiny tags; full value in tooltip. */
export function shortModelName(model: string): string {
  const parts = model.split('/');
  return parts.length > 1 ? (parts[parts.length - 1] ?? model) : model;
}
