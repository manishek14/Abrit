import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntdApp } from 'antd';
import { Composer } from './Composer';

function renderComposer(props: Partial<Parameters<typeof Composer>[0]> = {}) {
  const onSend = vi.fn(async (_content: string, _clientMessageId: string) => {});
  const utils = render(
    <AntdApp>
      <Composer onSend={onSend} {...props} />
    </AntdApp>,
  );
  const textarea = screen.getByRole('textbox', { name: /reply to the user/i });
  const sendButton = screen.getByRole('button', { name: /send/i });
  return { onSend, textarea, sendButton, ...utils };
}

describe('Composer (operator replies — review fix #4)', () => {
  it('sends the trimmed draft WITH an idempotency key and clears the input', async () => {
    const { onSend, textarea, sendButton } = renderComposer();
    await userEvent.type(textarea, '  سلام، رسیدیم  ');
    await userEvent.click(sendButton);
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith('سلام، رسیدیم', expect.any(String)),
    );
    await waitFor(() => expect(textarea).toHaveValue(''));
  });

  it('Enter sends, Shift+Enter inserts a newline instead', async () => {
    const { onSend, textarea } = renderComposer();
    await userEvent.type(textarea, 'first line');
    await userEvent.type(textarea, '{Shift>}{Enter}{/Shift}');
    await userEvent.type(textarea, 'second line');
    expect(onSend).not.toHaveBeenCalled();
    await userEvent.type(textarea, '{Enter}');
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(onSend.mock.calls[0][0]).toBe('first line\nsecond line');
  });

  it('IDEMPOTENCY (review fix): a failed send keeps the draft AND reuses the SAME key on retry', async () => {
    const onSend = vi
      .fn<(content: string, clientMessageId: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('timeout')) // first attempt "lost"
      .mockResolvedValueOnce(undefined); // retry succeeds
    render(
      <AntdApp>
        <Composer onSend={onSend} />
      </AntdApp>,
    );
    const textarea = screen.getByRole('textbox', { name: /reply to the user/i });
    const sendButton = screen.getByRole('button', { name: /send/i });

    await userEvent.type(textarea, 'پاسخ یکتا');
    await userEvent.click(sendButton);
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));

    // draft kept for a one-click retry…
    await waitFor(() => expect(textarea).toHaveValue('پاسخ یکتا'));
    await userEvent.click(sendButton);
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));

    // THE key behavior: the retry carried the SAME idempotency key, so the
    // server replays the original message instead of storing a duplicate.
    expect(onSend.mock.calls[0][1]).toBe(onSend.mock.calls[1][1]);
    expect(onSend.mock.calls[0][1]).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    await waitFor(() => expect(textarea).toHaveValue('')); // cleared on success
  });

  it('IDEMPOTENCY: a NEW send after a successful one gets a FRESH key', async () => {
    const { onSend, textarea, sendButton } = renderComposer();
    await userEvent.type(textarea, 'first');
    await userEvent.click(sendButton);
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    await userEvent.type(textarea, 'second');
    await userEvent.click(sendButton);
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
    expect(onSend.mock.calls[0][1]).not.toBe(onSend.mock.calls[1][1]);
  });

  it('keeps the draft when sending fails so the operator can retry', async () => {
    const onSend = vi.fn(async () => {
      throw new Error('boom');
    });
    render(
      <AntdApp>
        <Composer onSend={onSend} />
      </AntdApp>,
    );
    const textarea = screen.getByRole('textbox', { name: /reply to the user/i });
    const sendButton = screen.getByRole('button', { name: /send/i });
    await userEvent.type(textarea, 'draft stays');
    await userEvent.click(sendButton);
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(textarea).toHaveValue('draft stays'));
  });

  it('ignores a second click while the first send is in flight (double-click guard)', async () => {
    let resolveFirst: () => void = () => {};
    const onSend = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    render(
      <AntdApp>
        <Composer onSend={onSend} />
      </AntdApp>,
    );
    const textarea = screen.getByRole('textbox', { name: /reply to the user/i });
    const sendButton = screen.getByRole('button', { name: /send/i });
    await userEvent.type(textarea, 'only once');
    await userEvent.click(sendButton);
    expect(onSend).toHaveBeenCalledTimes(1);
    // rapid second click while still submitting → must not send again
    await userEvent.click(sendButton);
    expect(onSend).toHaveBeenCalledTimes(1);
    resolveFirst();
    // the first send completed (draft cleared) and still fired exactly once
    await waitFor(() => expect(textarea).toHaveValue(''));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('disables the input and explains why when the ticket is closed', async () => {
    const { onSend, textarea } = renderComposer({
      disabled: true,
      disabledHint: 'This ticket is closed — reopen it to send replies.',
    });
    expect(textarea).toBeDisabled();
    expect(screen.getByText('This ticket is closed — reopen it to send replies.')).toBeInTheDocument();
    await userEvent.type(textarea, 'x'); // no-op on a disabled field
    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not send an empty draft', async () => {
    const { onSend, sendButton } = renderComposer();
    expect(sendButton).toBeDisabled();
    await userEvent.click(sendButton);
    expect(onSend).not.toHaveBeenCalled();
  });
});
