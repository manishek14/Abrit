import { useEffect, useRef } from 'react';
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

/**
 * Chat transcript. USER/ADMIN right-aligned, ASSISTANT left, SYSTEM centered.
 * Content is bidi-safe (`dir="auto"` + `unicode-bidi: plaintext`) so Persian
 * renders correctly next to Latin text. Auto-scrolls to the newest message
 * only while the user is near the bottom.
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container || messages.length === 0) return;
    if (!didInitialScrollRef.current) {
      container.scrollTop = container.scrollHeight;
      didInitialScrollRef.current = true;
      stickToBottomRef.current = true;
      return;
    }
    if (stickToBottomRef.current) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
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
          description="Messages from the user will appear here as soon as they write to the bot. Replies you send are delivered to their Telegram chat."
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

  const isOwnSide = message.role === 'USER' || message.role === 'ADMIN';

  return (
    <div className={`msg-row ${isOwnSide ? 'msg-row--right' : 'msg-row--left'}`}>
      <div className={`msg-bubble msg-bubble--${message.role.toLowerCase()}`}>
        <div className="msg-content bidi" dir="auto">
          {message.content}
        </div>
        <div className="msg-meta">
          {message.role === 'ADMIN' && <Tag className="msg-tag">Support</Tag>}
          {message.role === 'ASSISTANT' && message.meta?.model != null && (
            <Tooltip title={assistantMetaTooltip(message.meta)}>
              <Tag color="geekblue" className="msg-tag">
                {shortModelName(message.meta.model)}
              </Tag>
            </Tooltip>
          )}
          {message.delivery_status === 'PENDING' && <Tag className="msg-tag">Sending…</Tag>}
          {message.delivery_status === 'FAILED' && (
            <Tooltip title={message.error ?? 'Delivery to Telegram failed.'}>
              <Tag color="error" className="msg-tag">
                Delivery failed
              </Tag>
            </Tooltip>
          )}
          <span className="msg-time">{formatTimeShort(message.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

function assistantMetaTooltip(meta: MessageMeta): string {
  const parts: string[] = [];
  if (meta.provider) parts.push(`Provider: ${String(meta.provider)}`);
  if (meta.model) parts.push(`Model: ${meta.model}`);
  if (typeof meta.latencyMs === 'number') parts.push(`Latency: ${meta.latencyMs} ms`);
  return parts.length > 0 ? parts.join(' · ') : 'Assistant message';
}
