import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

// dayjs.fromNow() needs the relativeTime plugin (main.tsx registers it in the app)
dayjs.extend(relativeTime);

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mockNavigate,
}));

const mockUseUser = vi.fn();
vi.mock('../api/hooks', () => ({
  useUser: (userId: string) => mockUseUser(userId),
}));

import { UserDrawer } from './UserDrawer';
import type { TelegramUserWithTickets } from '../types';

const user: TelegramUserWithTickets = {
  id: 'u-1',
  telegram_id: '555',
  chat_id: '555',
  username: 'sara',
  first_name: 'سارا',
  last_name: null,
  language_code: 'fa',
  is_blocked: false,
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-01T10:00:00Z',
  last_seen_at: '2026-11-06T09:00:00Z',
  tickets: [
    {
      id: 't-1',
      ticket_number: 'TKT-10001',
      user_id: 'u-1',
      status: 'OPEN',
      subject: 'مشکل پرداخت',
      created_at: '2026-11-05T10:00:00Z',
      updated_at: '2026-11-05T10:00:00Z',
      last_message_at: '2026-11-06T09:00:00Z',
      closed_at: null,
    },
    {
      id: 't-2',
      ticket_number: 'TKT-10002',
      user_id: 'u-1',
      status: 'CLOSED',
      subject: null,
      created_at: '2026-11-02T10:00:00Z',
      updated_at: '2026-11-03T10:00:00Z',
      last_message_at: '2026-11-03T10:00:00Z',
      closed_at: '2026-11-03T10:00:00Z',
    },
  ],
};

function renderDrawer() {
  const onClose = vi.fn();
  render(<UserDrawer userId={user.id} onClose={onClose} />);
  return { onClose };
}

describe('UserDrawer (keyboard accessibility — review fix)', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockUseUser.mockReturnValue({
      data: user,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('renders every ticket as a REAL button with an accessible name', () => {
    renderDrawer();
    const buttons = screen.getAllByRole('button', { name: /Open ticket TKT-\d+/i });
    expect(buttons).toHaveLength(2);
    // the previous implementation put role="button" on a List.Item — the
    // accessible name lived on the wrong element
    expect(buttons[0]).toHaveAccessibleName('Open ticket TKT-10001');
  });

  it('Enter opens the focused ticket', async () => {
    const { onClose } = renderDrawer();
    const first = screen.getByRole('button', { name: /Open ticket TKT-10001/i });
    first.focus();
    await userEvent.keyboard('{Enter}');
    expect(mockNavigate).toHaveBeenCalledWith('/tickets/t-1');
    expect(onClose).toHaveBeenCalled();
  });

  it('Space ALSO opens the ticket (native button semantics — the review finding)', async () => {
    const { onClose } = renderDrawer();
    const second = screen.getByRole('button', { name: /Open ticket TKT-10002/i });
    second.focus();
    // a native <button> activates on Space at keyUP; the previous
    // role="button" row only handled Enter and Space just scrolled the drawer
    await userEvent.keyboard(' ');
    expect(mockNavigate).toHaveBeenCalledWith('/tickets/t-2');
    expect(onClose).toHaveBeenCalled();
  });

  it('the buttons are keyboard-focusable in sequence (tabIndex parity, no dead rows)', async () => {
    renderDrawer();
    const buttons = screen.getAllByRole('button', { name: /Open ticket TKT-\d+/i });
    buttons[0].focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(buttons[1]);
  });

  it('shows the profile fields and both tickets with their subjects', () => {
    renderDrawer();
    expect(screen.getByText(/TKT-10001/)).toBeInTheDocument();
    expect(screen.getByText('مشکل پرداخت')).toBeInTheDocument();
    expect(screen.getByText('No subject')).toBeInTheDocument();
    expect(screen.getByText('@sara')).toBeInTheDocument();
  });
});
