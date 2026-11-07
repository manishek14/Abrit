import { describe, expect, it } from 'vitest';
import { compareMessageIds, mergeMessages, sortMessages } from './messages';
import type { Message } from '../types';

const msg = (id: string, over: Partial<Message> = {}): Message =>
  ({
    id,
    ticket_id: 't-1',
    role: 'USER',
    content: `message ${id}`,
    delivery_status: null,
    delivery_attempts: 0,
    error: null,
    telegram_message_id: null,
    admin_id: null,
    meta: null,
    created_at: '2026-11-01T10:00:00Z',
    sent_at: null,
    ...over,
  }) as Message;

describe('compareMessageIds (bigint ids serialized as strings)', () => {
  it('compares NUMERICALLY — lexicographic order would break pagination cursors', () => {
    // '9' vs '10': lexicographically '9' > '10', numerically the opposite.
    expect(compareMessageIds('9', '10')).toBe(-1);
    expect(compareMessageIds('10', '9')).toBe(1);
    expect(compareMessageIds('42', '42')).toBe(0);
  });

  it('falls back to lexicographic order for malformed ids', () => {
    expect(compareMessageIds('abc', 'abd')).toBe(-1);
  });
});

describe('mergeMessages (conversation cache merging — pagination contract)', () => {
  it('appends a newer page after an older page, ascending by id', () => {
    const olderPage = [msg('1'), msg('2'), msg('3')];
    const newerPage = [msg('4'), msg('5')];
    expect(mergeMessages(olderPage, newerPage).map((m) => m.id)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('prepends a load-older page before the cached slice (load-older flow)', () => {
    const cachedNewest = [msg('11'), msg('12')];
    const olderPage = [msg('9'), msg('10')];
    expect(mergeMessages(cachedNewest, olderPage).map((m) => m.id)).toEqual(['9', '10', '11', '12']);
  });

  it('dedupes by id — a realtime re-delivery replaces the cached copy, never duplicates', () => {
    const cached = [msg('1'), msg('2', { delivery_status: 'PENDING' })];
    const update = msg('2', { delivery_status: 'SENT' }); // message:updated for the same id
    const merged = mergeMessages(cached, [update]);
    expect(merged).toHaveLength(2);
    expect(merged.find((m) => m.id === '2')?.delivery_status).toBe('SENT');
  });

  it('sorts numeric ids correctly even when the incoming order is shuffled', () => {
    const merged = sortMessages([msg('10'), msg('2'), msg('100'), msg('9')]);
    expect(merged.map((m) => m.id)).toEqual(['2', '9', '10', '100']);
  });
});
