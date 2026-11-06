import { useState, type KeyboardEvent } from 'react';
import { App as AntdApp, Button, Input, Typography } from 'antd';
import { SendOutlined } from '@ant-design/icons';

interface ComposerProps {
  /** True when the ticket is CLOSED (or replies are otherwise unavailable). */
  disabled?: boolean;
  /** Shown when disabled — explains how to re-enable (e.g. "reopen the ticket"). */
  disabledHint?: string;
  onSend: (content: string) => Promise<void>;
}

/** Admin replies are chunked to Telegram's 4096-char hard limit by the backend. */
const MAX_REPLY_LENGTH = 4000;

/**
 * Operator reply composer (review fix #4). A submit lock makes rapid double
 * clicks / Enter presses impossible to double-send: while the POST is in
 * flight the button is disabled and further Enter presses are swallowed.
 * On failure the draft is KEPT so the operator can retry with one click.
 */
export function Composer({ disabled = false, disabledHint, onSend }: ComposerProps): JSX.Element {
  const { message: antdMessage } = AntdApp.useApp();
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSend = value.trim().length > 0 && !submitting && !disabled;

  const send = async (): Promise<void> => {
    const content = value.trim();
    if (!content || submitting || disabled) return;
    setSubmitting(true);
    try {
      await onSend(content);
      setValue('');
    } catch {
      // draft is intentionally kept — retry is a single click
      antdMessage.error('Failed to send the reply — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault(); // never insert a newline while sending
      void send();
    }
  };

  return (
    <div>
      <div className="composer">
        <Input.TextArea
          aria-label="Reply to the user"
          placeholder={
            disabled
              ? (disabledHint ?? 'Replies are unavailable for this ticket')
              : 'Write a reply… (Enter to send, Shift+Enter for a new line)'
          }
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={MAX_REPLY_LENGTH}
          showCount
          autoSize={{ minRows: 2, maxRows: 6 }}
          disabled={disabled}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          disabled={!canSend}
          loading={submitting}
          onClick={() => void send()}
        >
          Send
        </Button>
      </div>
      {disabled && disabledHint && (
        <Typography.Text type="secondary" className="composer-hint">
          {disabledHint}
        </Typography.Text>
      )}
    </div>
  );
}
