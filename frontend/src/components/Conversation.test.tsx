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

  it('renders the transcript: ADMIN (operator) on the right, USER and ASSISTANT on the left, SYSTEM centered', () => {
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
    // support-panel sides (review fix): the operator's own voice is ADMIN/right;
    // the customer (USER) and the bot (ASSISTANT) sit on the left.
    expect(screen.getByText('پیام کاربر').closest('.msg-row')).toHaveClass('msg-row--left');
    expect(screen.getByText('تیکت ایجاد شد').closest('.msg-row')).toHaveClass('msg-row--system');
    expect(screen.getByText('پاسخ دستیار').closest('.msg-row')).toHaveClass('msg-row--left');
    expect(screen.getByText('پاسخ کارشناس').closest('.msg-row')).toHaveClass('msg-row--right');
    // the two voices are explicitly labelled, not only positioned
    expect(screen.getByText('Support')).toBeInTheDocument();
    expect(screen.getByText('Customer')).toBeInTheDocument();
    expect(screen.getByText('Sending…')).toBeInTheDocument();
  });

  it('shows the full delivery lifecycle: Sending → Sent, and Retrying vs Failed (review fix)', () => {
    render(
      <Conversation
        loading={false}
        messages={[
          msg('1', { role: 'ADMIN', content: 'در حال ارسال', delivery_status: 'PENDING' }),
          msg('2', { role: 'ADMIN', content: 'ارسال شد', delivery_status: 'SENT' }),
          msg('3', {
            role: 'ADMIN',
            content: 'تلاش مجدد',
            delivery_status: 'FAILED',
            delivery_attempts: 1,
            error: 'network down',
          }),
          msg('4', {
            role: 'ADMIN',
            content: 'ناموفق نهایی',
            delivery_status: 'FAILED',
            delivery_attempts: 5,
            error: 'user blocked the bot',
          }),
        ]}
      />,
    );
    expect(screen.getByText('Sending…')).toBeInTheDocument();
    expect(screen.getByText('Sent')).toBeInTheDocument();
    expect(screen.getByText('Retrying')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('labels a FAILED reply as Retrying while attempts remain, with the reason in the tooltip', async () => {
    render(
      <Conversation
        loading={false}
        messages={[
          msg('1', {
            role: 'ADMIN',
            content: 'تلاش مجدد',
            delivery_status: 'FAILED',
            delivery_attempts: 2,
            error: 'network down',
          }),
        ]}
      />,
    );
    expect(screen.getByText('Retrying')).toBeInTheDocument();
    // hovering the badge reveals the failure reason + the scheduled backoff
    await userEvent.hover(screen.getByText('Retrying'));
    expect(
      await screen.findByText(/Not delivered: network down The next automatic attempt is scheduled/i),
    ).toBeInTheDocument();
  });

  describe('manual retry of a FAILED delivery (review round 5)', () => {
    const failedMessage = msg('9', {
      role: 'ADMIN',
      content: 'پیام ناموفق',
      delivery_status: 'FAILED',
      delivery_attempts: 5,
      error: 'telegram outage',
    });

    it('renders the Retry action next to the Failed badge and calls onRetryMessage with the message id', async () => {
      const onRetryMessage = vi.fn();
      render(
        <Conversation
          loading={false}
          messages={[failedMessage]}
          onRetryMessage={onRetryMessage}
        />,
      );
      expect(screen.getByText('Failed')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: /retry delivery of message 9/i }));
      expect(onRetryMessage).toHaveBeenCalledTimes(1);
      expect(onRetryMessage).toHaveBeenCalledWith('9');
    });

    it('shows NO Retry action when the parent does not wire onRetryMessage', () => {
      render(<Conversation loading={false} messages={[failedMessage]} />);
      expect(screen.getByText('Failed')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /retry delivery/i })).not.toBeInTheDocument();
    });

    it('never offers a Retry on USER messages or SENT/PENDING deliveries', () => {
      render(
        <Conversation
          loading={false}
          messages={[
            msg('1', { role: 'USER', content: 'پیام کاربر' }),
            msg('2', { role: 'ADMIN', content: 'ارسال شد', delivery_status: 'SENT' }),
            msg('3', { role: 'ADMIN', content: 'در حال ارسال', delivery_status: 'PENDING' }),
          ]}
          onRetryMessage={vi.fn()}
        />,
      );
      expect(screen.queryByRole('button', { name: /retry delivery/i })).not.toBeInTheDocument();
    });
  });
});

function containerSkeleton(): HTMLElement | null {
  // helper for the empty-state assertion: skeleton must be absent
  return document.querySelector('.ant-skeleton');
}
