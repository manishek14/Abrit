import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Conversation } from './Conversation';
import type { Message } from '../types';

const msg = (id: string, over: Partial<Message> = {}): Message =>
  ({
    id,
    ticket_id: 't-1',
    role: 'USER',
    content: `پیام ${id}`,
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

describe('Conversation states (review fix: loading / empty / error are separated)', () => {
  it('shows a skeleton while the FIRST page is loading', () => {
    const { container } = render(<Conversation messages={[]} loading />);
    expect(container.querySelector('.ant-skeleton')).toBeInTheDocument();
    // the empty-state text must NOT leak into the loading state
    expect(screen.queryByText("Conversation hasn't started")).not.toBeInTheDocument();
  });

  it('renders a designed empty state when the conversation has not started', () => {
    render(<Conversation messages={[]} loading={false} />);
    expect(screen.getByText("Conversation hasn't started")).toBeInTheDocument();
    expect(
      screen.getByText(/Messages from the user will appear here as soon as they write to the bot\./i),
    ).toBeInTheDocument();
    expect(containerSkeleton()).toBeNull();
  });

  it('shows an inline error with Retry when the initial load fails', async () => {
    const onRetry = vi.fn();
    render(
      <Conversation
        messages={[]}
        loading={false}
        error
        errorMessage="Network error"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText('Failed to load conversation')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps showing cached messages when a background refresh fails (no error takeover)', () => {
    render(
      <Conversation
        messages={[msg('1', { role: 'USER', content: 'سلام' })]}
        loading={false}
        error
        errorMessage="Network error"
      />,
    );
    expect(screen.getByText('سلام')).toBeInTheDocument();
    expect(screen.queryByText('Failed to load conversation')).not.toBeInTheDocument();
  });

  it('renders the transcript: USER/ADMIN on the right, ASSISTANT on the left, SYSTEM centered', () => {
    render(
      <Conversation
        loading={false}
        messages={[
          msg('1', { role: 'USER', content: 'پیام کاربر' }),
          msg('2', { role: 'SYSTEM', content: 'تیکت ایجاد شد' }),
          msg('3', { role: 'ASSISTANT', content: 'پاسخ دستیار', meta: { model: 'openrouter/auto' } }),
          msg('4', { role: 'ADMIN', content: 'پاسخ کارشناس', admin_id: 'a-1', delivery_status: 'PENDING' }),
        ]}
      />,
    );
    expect(screen.getByText('پیام کاربر').closest('.msg-row')).toHaveClass('msg-row--right');
    expect(screen.getByText('تیکت ایجاد شد').closest('.msg-row')).toHaveClass('msg-row--system');
    expect(screen.getByText('پاسخ دستیار').closest('.msg-row')).toHaveClass('msg-row--left');
    expect(screen.getByText('پاسخ کارشناس').closest('.msg-row')).toHaveClass('msg-row--right');
    // admin replies are labelled as Support and carry the delivery badge
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.getByText('Sending…')).toBeInTheDocument();
  });
});

function containerSkeleton(): HTMLElement | null {
  // helper for the empty-state assertion: skeleton must be absent
  return document.querySelector('.ant-skeleton');
}
