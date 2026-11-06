import { useRef, useState, type KeyboardEvent } from 'react';
import { App as AntdApp, Button, Input, Typography } from 'antd';
import { SendOutlined } from '@ant-design/icons';

interface ComposerProps {
  /** True when the ticket is CLOSED / the user is BLOCKED (replies unavailable). */
  disabled?: boolean;
  /** Shown when disabled — explains how to re-enable (e.g. "reopen the ticket"). */
  disabledHint?: string;
  /** Receives the trimmed content AND the idempotency key of this send. */
  onSend: (content: string, clientMessageId: string) => Promise<void>;
}

/** Admin replies are chunked to Telegram's 4096-char hard limit by the backend. */
const MAX_REPLY_LENGTH = 4000;

/**
 * Idempotency key per draft-send (review fix): generated the first time a draft
 * is submitted and REUSED on every retry until a send succeeds. The backend
 * stores it with a unique constraint, so a retry after a lost HTTP response
 * (timeout / network drop) replays the ORIGINAL message instead of storing a
 * duplicate — the user in Telegram can never receive the same reply twice.
 */
function newClientMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // jsdom / older browsers: url-safe, unique enough, matches the API contract
  return `cmid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Operator reply composer (review fix #4). A submit lock makes rapid double
 * clicks / Enter presses impossible to double-send: while the POST is in
 * flight the button is disabled and further Enter presses are swallowed.
 * On failure the draft AND its idempotency key are KEPT so the operator
 * retries the exact same send with one click.
 *
 * The parent mounts this with key={ticketId}: switching tickets remounts the
 * composer, so a half-written draft can never leak into another customer's
 * conversation (review fix — draft transfer between tickets).
 */
export function Composer({ disabled = false, disabledHint, onSend }: ComposerProps): JSX.Element {
  const { message: antdMessage } = AntdApp.useApp();
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const idRef = useRef<string | null>(null); // idempotency key of the pending/failed draft

  const canSend = value.trim().length > 0 && !submitting && !disabled;

  const send = async (): Promise<void> => {
    const content = value.trim();
    if (!content || submitting || disabled) return;
    idRef.current ??= newClientMessageId();
    const clientMessageId = idRef.current;
    setSubmitting(true);
    try {
      await onSend(content, clientMessageId);
      setValue('');
      idRef.current = null; // sent — the next draft gets a fresh key
    } catch {
      // draft AND key are intentionally kept — retry is a single click and
      // the server deduplicates it even if the first attempt actually landed
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
