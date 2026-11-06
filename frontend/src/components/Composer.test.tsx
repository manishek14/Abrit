import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App as AntdApp } from 'antd';
import { Composer } from './Composer';

function renderComposer(props: Partial<Parameters<typeof Composer>[0]> = {}) {
  const onSend = vi.fn(async () => {});
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
  it('sends the trimmed draft on click and clears the input', async () => {
    const { onSend, textarea, sendButton } = renderComposer();
    await userEvent.type(textarea, '  سلام، رسیدیم  ');
    await userEvent.click(sendButton);
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('سلام، رسیدیم'));
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
    expect(onSend.mock.calls[0]).toEqual(['first line\nsecond line']);
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
