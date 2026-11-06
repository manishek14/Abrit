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
 * is submitted and REUSED on every retry of the SAME content until a send
 * succeeds. The backend stores it with a unique constraint, so a retry after a
 * lost HTTP response (timeout / network drop) replays the ORIGINAL message
 * instead of storing a duplicate — the user in Telegram can never receive the
 * same reply twice.
 */
function newClientMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // jsdom / older browsers: url-safe, unique enough, matches the API contract
  return `cmid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** The pending (in-flight or last-failed) send attempt. */
interface PendingAttempt {
  key: string;
  /** The EXACT trimmed content this key was created for (review fix). */
  content: string;
}

/**
 * Operator reply composer (review fix #4). A submit lock makes rapid double
 * clicks / Enter presses impossible to double-send: while the POST is in
 * flight the button is disabled, the textarea is locked, and further Enter
 * presses are swallowed. On failure the draft AND its idempotency key are
 * KEPT so the operator retries the exact same send with one click.
 *
 * The key is BOUND TO THE CONTENT of the attempt (review fix — P1):
 *   - retrying the UNCHANGED draft reuses the key → the server replays the
 *     original message (no duplicate to the user);
 *   - EDITING the draft (e.g. after an ambiguous timeout) makes the next
 *     send a NEW message with a FRESH key — the server can never answer an
 *     edited draft with the old message and the panel can never wipe text
 *     that was never sent;
 *   - on success the box is cleared only of what this attempt actually sent.
 *
 * The parent mounts this with key={ticketId}: switching tickets remounts the
 * composer, so a half-written draft can never leak into another customer's
 * conversation (review fix — draft transfer between tickets).
 */
export function Composer({ disabled = false, disabledHint, onSend }: ComposerProps): JSX.Element {
  const { message: antdMessage } = AntdApp.useApp();
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pendingRef = useRef<PendingAttempt | null>(null);

  const canSend = value.trim().length > 0 && !submitting && !disabled;

  const send = async (): Promise<void> => {
    const content = value.trim();
    if (!content || submitting || disabled) return;

    // Content-bound idempotency (review fix): reuse the key ONLY for a retry of
    // the exact same content; any edit is a new send and gets a fresh key.
    if (!pendingRef.current || pendingRef.current.content !== content) {
      pendingRef.current = { key: newClientMessageId(), content };
    }
    const clientMessageId = pendingRef.current.key;
    const valueAtSubmit = value; // what the box held when this attempt left

    setSubmitting(true);
    try {
      await onSend(content, clientMessageId);
      // Clear ONLY what this attempt sent — if the box somehow changed since
      // (paste race, a future edit path), that text is kept for its own send.
      setValue((current) => (current === valueAtSubmit ? '' : current));
      pendingRef.current = null; // sent — the next draft gets a fresh key
    } catch {
      // Ambiguous outcome (timeout / network drop): the draft AND its key stay.
      // Retry without editing → safe replay; edit → a new send with a new key.
      antdMessage.error(
        'Failed to send — the draft is kept. Retry sends the same text; editing it sends a new message.',
      );
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
          // Locked while the send is in flight (review fix): no mid-flight
          // edits that the success path could then wipe or misattribute.
          disabled={disabled || submitting}
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
