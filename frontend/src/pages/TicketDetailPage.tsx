import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  App as AntdApp,
  Button,
  Card,
  Descriptions,
  Popconfirm,
  Result,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
  type DescriptionsProps,
} from 'antd';
import {
  ArrowLeftOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { AxiosError } from 'axios';
import dayjs from 'dayjs';
import {
  useChangeTicketStatus,
  useConversation,
  useLoadOlderMessages,
  useRetryFailedMessage,
  useSendAdminMessage,
  useTicket,
} from '../api/hooks';
import { queryKeys } from '../api/keys';
import { getApiErrorMessage } from '../api/client';
import { setCurrentTicketId } from '../socket';
import { StatusBadge, TICKET_STATUS_OPTIONS, statusLabel } from '../components/StatusBadge';
import { Conversation } from '../components/Conversation';
import { Composer } from '../components/Composer';
import { formatDateTime, userDisplayName } from '../utils/format';
import type { TicketStatus } from '../types';

/**
 * Conversation-first ticket detail (review fix): a compact header carries the
 * ticket number, subject, status control and key moments; the conversation is
 * the main column with the reply composer pinned underneath; customer and
 * ticket metadata live in a sticky sidebar that stacks below on mobile.
 */
export function TicketDetailPage(): JSX.Element {
  const { ticketId = '' } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message: antdMessage } = AntdApp.useApp();

  const ticketQuery = useTicket(ticketId);
  const conversationQuery = useConversation(ticketId);
  const changeStatusMutation = useChangeTicketStatus(ticketId);
  const loadOlderMutation = useLoadOlderMessages(ticketId);
  const sendMessageMutation = useSendAdminMessage(ticketId);
  // Manual retry of a FAILED delivery (review round 5): the Conversation's
  // Retry button re-arms the outbox row; realtime events settle the badge.
  const retryMessageMutation = useRetryFailedMessage(ticketId);

  const conversation = conversationQuery.data;
  const messages = conversation?.messages ?? [];
  const hasMoreOlder = conversation?.hasMoreOlder ?? false;

  const [pendingStatus, setPendingStatus] = useState<TicketStatus | null>(null);

  // Track which conversation is on screen (for realtime merges) and force a
  // cheap incremental refetch of both queries every time the page is opened.
  // Mutations reset on ticket switch so no stale error/sending state can
  // leak into the next conversation (review fix).
  useEffect(() => {
    setCurrentTicketId(ticketId);
    loadOlderMutation.reset();
    sendMessageMutation.reset();
    void queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticketId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.messages(ticketId) });
    return () => setCurrentTicketId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const notFound =
    ticketQuery.isError && ticketQuery.error instanceof AxiosError && ticketQuery.error.response?.status === 404;

  const confirmStatusChange = async (): Promise<void> => {
    if (pendingStatus == null) return;
    const nextStatus = pendingStatus;
    setPendingStatus(null);
    try {
      const result = await changeStatusMutation.mutateAsync(nextStatus);
      if (!result.changed) {
        antdMessage.info(`Ticket is already ${statusLabel(result.ticket.status).toLowerCase()}.`);
      } else {
        antdMessage.success(`Ticket status changed to ${statusLabel(result.ticket.status)}.`);
      }
    } catch (error) {
      // Includes 409 (user has another active ticket) and 400 (invalid status).
      antdMessage.error(getApiErrorMessage(error, 'Failed to change ticket status.'));
    }
  };

  if (notFound) {
    return (
      <Result
        status="404"
        title="Ticket not found"
        subTitle="The ticket you are looking for does not exist."
        extra={
          <Button type="primary" onClick={() => navigate('/tickets')}>
            Back to tickets
          </Button>
        }
      />
    );
  }

  const ticket = ticketQuery.data;
  const closed = ticket != null && ticket.status === 'CLOSED';
  // Blocked customers cannot receive Telegram replies (the dispatcher would
  // permanently fail the send) — the composer explains this instead of letting
  // the operator type into the void (review fix). The BACKEND remains the
  // source of truth for sendability; this is a UX guard only.
  const blocked = ticket?.user.is_blocked ?? false;
  const repliesDisabled = closed || blocked;
  const replyDisabledHint = closed
    ? 'This ticket is closed — reopen it (status menu above) to send replies.'
    : blocked
      ? 'This user has blocked the bot — replies cannot be delivered to their Telegram chat.'
      : undefined;

  const userItems: DescriptionsProps['items'] = ticket
    ? [
        {
          key: 'user',
          label: 'Name',
          children: (
            <Space size={8} wrap>
              <span>{userDisplayName(ticket.user)}</span>
              {ticket.user.is_blocked && <Tag color="error">Blocked</Tag>}
            </Space>
          ),
        },
        {
          key: 'telegram-id',
          label: 'Telegram ID',
          children: (
            <Typography.Text copyable={{ text: ticket.user.telegram_id }}>
              {ticket.user.telegram_id}
            </Typography.Text>
          ),
        },
        { key: 'username', label: 'Username', children: ticket.user.username ? `@${ticket.user.username}` : '—' },
        { key: 'language', label: 'Language', children: ticket.user.language_code ?? '—' },
      ]
    : [];

  const detailItems: DescriptionsProps['items'] = ticket
    ? [
        { key: 'status', label: 'Status', children: <StatusBadge status={ticket.status} /> },
        { key: 'created', label: 'Created', children: formatDateTime(ticket.created_at) },
        {
          key: 'last-activity',
          label: 'Last activity',
          children: (
            <Tooltip title={formatDateTime(ticket.last_message_at)}>
              {dayjs(ticket.last_message_at).fromNow()}
            </Tooltip>
          ),
        },
        ...(ticket.closed_at
          ? [{ key: 'closed-at', label: 'Closed at', children: formatDateTime(ticket.closed_at) }]
          : []),
      ]
    : [];

  return (
    <Space direction="vertical" size={16} className="ab-page" style={{ width: '100%' }}>
      {ticketQuery.isError && !ticket && (
        <Result
          status="warning"
          title="Failed to load ticket"
          subTitle={getApiErrorMessage(ticketQuery.error)}
          extra={
            <Button type="primary" onClick={() => void ticketQuery.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {ticketQuery.isLoading && !ticket && (
        <Card loading>
          <div style={{ height: 220 }} />
        </Card>
      )}

      {ticket && (
        <div className="ticket-detail">
          {/* Header: identity + status + key moments — the conversation is the hero below. */}
          <div className="ticket-detail__header">
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/tickets')} aria-label="Back to tickets" />
            <Space direction="vertical" size={0} className="ticket-detail__header-title-wrap">
              <Space size={10}>
                <Typography.Title level={4} className="ticket-detail__header-title">
                  {ticket.ticket_number}
                </Typography.Title>
                {/* status readable at first glance (review fix) — the select on
                    the right remains the control for CHANGING it */}
                <StatusBadge status={ticket.status} />
              </Space>
              {ticket.subject ? (
                <Typography.Text type="secondary">{ticket.subject}</Typography.Text>
              ) : (
                <Typography.Text type="secondary" italic>
                  No subject
                </Typography.Text>
              )}
            </Space>
            <Popconfirm
              title="Change ticket status"
              description={`Set this ticket to "${pendingStatus ? statusLabel(pendingStatus) : ''}"?`}
              open={pendingStatus !== null}
              onConfirm={() => void confirmStatusChange()}
              onCancel={() => setPendingStatus(null)}
              okText="Confirm"
              cancelText="Cancel"
            >
              <Select
                value={pendingStatus ?? ticket.status}
                options={TICKET_STATUS_OPTIONS}
                onChange={(value: TicketStatus) => setPendingStatus(value)}
                style={{ width: 170 }}
                disabled={changeStatusMutation.isPending}
                aria-label="Ticket status"
              />
            </Popconfirm>
            <div className="ticket-detail__header-meta">
              <Tooltip title={formatDateTime(ticket.created_at)}>
                <span>
                  <CalendarOutlined /> {dayjs(ticket.created_at).fromNow()}
                </span>
              </Tooltip>
              <Tooltip title={formatDateTime(ticket.last_message_at)}>
                <span className="ticket-detail__header-activity">
                  <ClockCircleOutlined /> active {dayjs(ticket.last_message_at).fromNow()}
                </span>
              </Tooltip>
            </div>
          </div>

          <div className="ticket-detail__body">
            {/* Main column: transcript + composer, like a chat app. */}
            <div className="ticket-detail__main">
              <Card styles={{ body: { padding: 16 } }}>
                {conversationQuery.isError && messages.length > 0 && (
                  <Typography.Text type="secondary" className="conversation-refresh-note">
                    Live refresh failed — showing the loaded history.
                  </Typography.Text>
                )}
                {hasMoreOlder && (
                  <div className="conversation-load-older">
                    <Button
                      size="small"
                      loading={loadOlderMutation.isPending}
                      onClick={() => loadOlderMutation.mutate()}
                    >
                      Load older messages
                    </Button>
                    {/* Load-older failures surface INLINE with their own retry
                        (review fix): previously the mutation failed silently
                        and the operator had no idea history hadn't loaded. */}
                    {loadOlderMutation.isError && (
                      <Typography.Text
                        type="danger"
                        role="alert"
                        className="conversation-load-older__error"
                      >
                        {getApiErrorMessage(loadOlderMutation.error, "Couldn't load older messages.")}
                      </Typography.Text>
                    )}
                    {loadOlderMutation.isError && (
                      <Button
                        size="small"
                        type="link"
                        onClick={() => loadOlderMutation.mutate()}
                      >
                        Retry
                      </Button>
                    )}
                  </div>
                )}
                <Conversation
                  key={ticketId}
                  messages={messages}
                  loading={conversationQuery.isLoading}
                  error={conversationQuery.isError && messages.length === 0}
                  errorMessage={getApiErrorMessage(conversationQuery.error)}
                  onRetry={() => void conversationQuery.refetch()}
                  onRetryMessage={(messageId) => retryMessageMutation.mutate(messageId)}
                />
              </Card>
              <Card styles={{ body: { padding: 16 } }}>
                {/* key={ticketId}: remounts the composer on ticket switch so a
                    half-written draft (and its idempotency key) can never be
                    sent to the WRONG customer (review fix — draft transfer). */}
                <Composer
                  key={ticketId}
                  disabled={repliesDisabled}
                  disabledHint={replyDisabledHint}
                  onSend={async (content, clientMessageId) => {
                    await sendMessageMutation.mutateAsync({
                      content,
                      client_message_id: clientMessageId,
                    });
                  }}
                />
              </Card>
            </div>

            {/* Sidebar: customer + ticket metadata. */}
            <aside className="ticket-detail__side">
              <Card
                title={
                  <Space size={8}>
                    <UserOutlined />
                    Customer
                  </Space>
                }
                styles={{ body: { padding: 16 } }}
              >
                <Descriptions column={1} size="small" items={userItems} />
              </Card>
              <Card title="Ticket details" styles={{ body: { padding: 16 } }}>
                <Descriptions column={1} size="small" items={detailItems} />
              </Card>
            </aside>
          </div>
        </div>
      )}
    </Space>
  );
}
