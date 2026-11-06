import { useLayoutEffect, useRef } from 'react';
import { Alert, Button, Skeleton, Tag, Tooltip } from 'antd';
import { CommentOutlined } from '@ant-design/icons';
import type { Message, MessageMeta } from '../types';
import { EmptyState } from './EmptyState';
import { formatDateTime, formatTimeShort, shortModelName } from '../utils/format';
import './conversation.css';

interface ConversationProps {
  messages: Message[];
  loading: boolean;
  /** True when the initial load failed AND nothing is cached. */
  error?: boolean;
  /** Human-readable error text (ignored when there are cached messages). */
  errorMessage?: string;
  /** Retry callback rendered with the error state. */
  onRetry?: () => void;
}

const NEAR_BOTTOM_PX = 80;

/** Mirrors the backend's MAX_DELIVERY_ATTEMPTS — beyond this, FAILED is terminal. */
const MAX_DELIVERY_ATTEMPTS = 5;

/**
 * Chat transcript (support-panel convention, review fix):
 *   ADMIN (the operator) on the RIGHT — clearly the agent's own voice;
 *   USER and ASSISTANT on the LEFT — the customer and the bot the agent
 *   answers on behalf of; SYSTEM centered as a neutral event note.
 * Content is bidi-safe (`dir="auto"` + `unicode-bidi: plaintext`) so Persian
 * renders correctly next to Latin text.
 *
 * Scroll behavior (review fix):
 *   - initial load / ticket switch: jump to the NEWEST message;
 *   - "load older" prepends history: the viewport is anchored to the same
 *     CONTENT position (scrollHeight delta compensation) so the operator's
 *     reading position never jumps — the professional chat-client behavior;
 *   - new realtime messages auto-scroll ONLY while the operator is at the
 *     bottom (stick-to-bottom).
 *
 * The parent mounts this with key={ticketId}: switching tickets remounts the
 * transcript, so scroll state and refs can never leak across conversations.
 *
 * Loading / empty / error states are fully separated (review fix): a skeleton
 * while the first page loads, a designed empty state when the conversation
 * has not started, and an inline error with Retry when the initial load fails.
 */
export function Conversation({
  messages,
  loading,
  error = false,
  errorMessage,
  onRetry,
}: ConversationProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const didInitialScrollRef = useRef(false);
  const prevScrollHeightRef = useRef(0);
  const prevFirstIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || messages.length === 0) return;
    const firstId = messages[0].id;

    if (!didInitialScrollRef.current) {
      container.scrollTop = container.scrollHeight;
      didInitialScrollRef.current = true;
      stickToBottomRef.current = true;
      prevFirstIdRef.current = firstId;
      prevScrollHeightRef.current = container.scrollHeight;
      return;
    }

    const didPrepend = prevFirstIdRef.current !== null && firstId !== prevFirstIdRef.current;
    if (didPrepend) {
      // "Load older" added content ABOVE the viewport. Keep the exact visual
      // position (review fix): shift scrollTop by the height delta BEFORE
      // paint, so the operator's reading position never jumps and the newly
      // loaded history simply becomes available above.
      const delta = container.scrollHeight - prevScrollHeightRef.current;
      if (delta > 0) container.scrollTop += delta;
      // stickToBottom is deliberately untouched: the operator chose to read
      // history; auto-follow resumes once they scroll back near the bottom.
    } else if (stickToBottomRef.current) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
    prevFirstIdRef.current = firstId;
    prevScrollHeightRef.current = container.scrollHeight;
  }, [messages]);

  const handleScroll = (): void => {
    const container = containerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    stickToBottomRef.current = distanceFromBottom < NEAR_BOTTOM_PX;
  };

  if (messages.length === 0 && loading) {
    return (
      <div className="conversation conversation--loading" aria-busy="true">
        <Skeleton active title={false} paragraph={{ rows: 6 }} />
      </div>
    );
  }

  if (messages.length === 0 && error) {
    return (
      <div className="conversation conversation--loading">
        <Alert
          type="error"
          showIcon
          message="Failed to load conversation"
          description={errorMessage}
          action={
            onRetry && (
              <Button size="small" onClick={onRetry}>
                Retry
              </Button>
            )
          }
        />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="conversation">
        <EmptyState
          icon={<CommentOutlined />}
          title="Conversation hasn't started"
          description="Messages from the user will appear here as soon as they write to the bot."
        />
      </div>
    );
  }

  return (
    <div className="conversation" ref={containerRef} onScroll={handleScroll} role="log" aria-live="polite">
      {messages.map((message) => (
        <MessageRow key={message.id} message={message} />
      ))}
    </div>
  );
}

function MessageRow({ message }: { message: Message }): JSX.Element {
  if (message.role === 'SYSTEM') {
    return (
      <div className="msg-row msg-row--system">
        <div className="msg-system-wrap">
          <Tooltip title={formatDateTime(message.created_at)}>
            <div className="msg-system bidi" dir="auto">
              {message.content}
            </div>
          </Tooltip>
          <span className="msg-time msg-time--centered">{formatTimeShort(message.created_at)}</span>
        </div>
      </div>
    );
  }

  // Support-panel sides (review fix): the operator's OWN voice (ADMIN) sits on
  // the right; the customer (USER) and the bot (ASSISTANT) sit on the left.
  const isOperatorSide = message.role === 'ADMIN';

  return (
    <div className={`msg-row ${isOperatorSide ? 'msg-row--right' : 'msg-row--left'}`}>
      <div className={`msg-bubble msg-bubble--${message.role.toLowerCase()}`}>
        <div className="msg-content bidi" dir="auto">
          {message.content}
        </div>
        <div className="msg-meta">
          {message.role === 'ADMIN' && <Tag className="msg-tag">Support</Tag>}
          {message.role === 'USER' && <Tag className="msg-tag msg-tag--muted">Customer</Tag>}
          {message.role === 'ASSISTANT' && message.meta?.model != null && (
            <Tooltip title={assistantMetaTooltip(message.meta)}>
              <Tag color="geekblue" className="msg-tag">
                {shortModelName(message.meta.model)}
              </Tag>
            </Tooltip>
          )}
          <DeliveryBadge message={message} />
          <span className="msg-time">{formatTimeShort(message.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Outbound delivery status, visible at a glance (review fix):
 *   Sending… → the durable outbox owns the send
 *   Sent     → delivered to Telegram
 *   Retrying → failed, the sweeper retries automatically (attempt info in tooltip)
 *   Failed   → terminal (attempts exhausted / user blocked); error in tooltip
 */
function DeliveryBadge({ message }: { message: Message }): JSX.Element | null {
  if (message.delivery_status == null || message.role === 'USER') return null;

  if (message.delivery_status === 'PENDING') {
    return <Tag className="msg-tag">Sending…</Tag>;
  }
  if (message.delivery_status === 'SENT') {
    return <Tag className="msg-tag msg-tag--sent">Sent</Tag>;
  }
  if (message.delivery_status === 'FAILED') {
    const terminal = message.delivery_attempts >= MAX_DELIVERY_ATTEMPTS;
    if (terminal) {
      return (
        <Tooltip
          title={message.error ? `Not delivered: ${message.error}` : 'Delivery to Telegram failed permanently.'}
        >
          <Tag color="error" className="msg-tag">
            Failed
          </Tag>
        </Tooltip>
      );
    }
    return (
      <Tooltip
        title={`${message.error ? `${message.error} — ` : ''}automatically retrying (attempt ${message.delivery_attempts + 1} of ${MAX_DELIVERY_ATTEMPTS}).`}
      >
        <Tag color="warning" className="msg-tag">
          Retrying
        </Tag>
      </Tooltip>
    );
  }
  return null;
}

function assistantMetaTooltip(meta: MessageMeta): string {
  const parts: string[] = [];
  if (meta.provider) parts.push(`Provider: ${String(meta.provider)}`);
  if (meta.model) parts.push(`Model: ${meta.model}`);
  if (typeof meta.latencyMs === 'number') parts.push(`Latency: ${meta.latencyMs} ms`);
  return parts.length > 0 ? parts.join(' · ') : 'Assistant message';
}
