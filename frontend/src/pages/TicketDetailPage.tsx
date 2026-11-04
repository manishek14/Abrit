import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Alert,
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
import { ArrowLeftOutlined } from '@ant-design/icons';
import { AxiosError } from 'axios';
import dayjs from 'dayjs';
import { useChangeTicketStatus, useConversation, useTicket } from '../api/hooks';
import { queryKeys } from '../api/keys';
import { getApiErrorMessage } from '../api/client';
import { setCurrentTicketId } from '../socket';
import { StatusBadge, TICKET_STATUS_OPTIONS, statusLabel } from '../components/StatusBadge';
import { Conversation } from '../components/Conversation';
import { formatDateTime, userDisplayName } from '../utils/format';
import type { TicketStatus } from '../types';

export function TicketDetailPage(): JSX.Element {
  const { ticketId = '' } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message: antdMessage } = AntdApp.useApp();

  const ticketQuery = useTicket(ticketId);
  const conversationQuery = useConversation(ticketId);
  const changeStatusMutation = useChangeTicketStatus(ticketId);

  const [pendingStatus, setPendingStatus] = useState<TicketStatus | null>(null);

  // Track which conversation is on screen (for realtime merges) and force a
  // cheap incremental refetch of both queries every time the page is opened.
  useEffect(() => {
    setCurrentTicketId(ticketId);
    void queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticketId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.messages(ticketId) });
    return () => setCurrentTicketId(null);
  }, [ticketId, queryClient]);

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

  const infoItems: DescriptionsProps['items'] = ticket
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
        {
          key: 'user',
          label: 'User',
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
        {
          key: 'username',
          label: 'Username',
          children: ticket.user.username ? `@${ticket.user.username}` : '—',
        },
        { key: 'language', label: 'Language', children: ticket.user.language_code ?? '—' },
      ]
    : [];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/tickets')}>
        Tickets
      </Button>

      {ticketQuery.isError && !ticket && (
        <Alert
          type="error"
          showIcon
          message="Failed to load ticket"
          description={getApiErrorMessage(ticketQuery.error)}
          action={
            <Button size="small" onClick={() => void ticketQuery.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      {ticketQuery.isLoading && !ticket && (
        <Card loading>
          <div style={{ height: 120 }} />
        </Card>
      )}

      {ticket && (
        <>
          <Card
            title={
              <Space direction="vertical" size={0}>
                <Typography.Text strong style={{ fontSize: 18 }}>
                  {ticket.ticket_number}
                </Typography.Text>
                {ticket.subject ? (
                  <Typography.Text type="secondary">{ticket.subject}</Typography.Text>
                ) : (
                  <Typography.Text type="secondary" italic>
                    No subject
                  </Typography.Text>
                )}
              </Space>
            }
            extra={
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
                />
              </Popconfirm>
            }
          >
            <Descriptions column={{ xs: 1, sm: 1, md: 2 }} size="small" items={infoItems} />
          </Card>

          <Card title="Conversation">
            {conversationQuery.isError && (
              <Alert
                type="error"
                showIcon
                message="Failed to load conversation"
                description={getApiErrorMessage(conversationQuery.error)}
                action={
                  <Button size="small" onClick={() => void conversationQuery.refetch()}>
                    Retry
                  </Button>
                }
                style={{ marginBottom: 16 }}
              />
            )}
            <Conversation messages={conversationQuery.data ?? []} loading={conversationQuery.isLoading} />
          </Card>
        </>
      )}
    </Space>
  );
}
