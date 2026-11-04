import type { Message } from '../types';

/**
 * Message ids are Postgres bigints serialized as strings, so comparing them
 * lexicographically would be wrong ('9' > '10'). Compare numerically, with a
 * defensive lexicographic fallback for malformed ids.
 */
export function compareMessageIds(a: string, b: string): number {
  try {
    const diff = BigInt(a) - BigInt(b);
    if (diff === 0n) return 0;
    return diff < 0n ? -1 : 1;
  } catch {
    return a.localeCompare(b);
  }
}

/** Returns a new list sorted by message id ascending. */
export function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => compareMessageIds(a.id, b.id));
}

/**
 * Merges incoming messages into an existing conversation: dedupes by id
 * (updates replace previous versions) and keeps ascending id order.
 */
export function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const message of existing) {
    byId.set(message.id, message);
  }
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return sortMessages([...byId.values()]);
}
