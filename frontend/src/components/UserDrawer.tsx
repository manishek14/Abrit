import { useNavigate } from 'react-router-dom';
import {
  Button,
  Descriptions,
  Drawer,
  List,
  Space,
  Tag,
  Tooltip,
  Typography,
  type DescriptionsProps,
} from 'antd';
import { FileTextOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useUser } from '../api/hooks';
import { getApiErrorMessage } from '../api/client';
import { EmptyState } from './EmptyState';
import { StatusBadge } from './StatusBadge';
import { formatDateTime, userDisplayName } from '../utils/format';
import type { Ticket } from '../types';

interface UserDrawerProps {
  userId: string | null;
  onClose: () => void;
}

/**
 * Drawer showing a Telegram user's profile and their tickets (newest first).
 * Loading / data / empty / error are distinct states (review fix): the error
 * state offers Retry, the empty state explains itself, and ticket rows are
 * real interactive elements (Enter + focus ring, not mouse-only). The width
 * is fluid so it never overflows small screens.
 */
export function UserDrawer({ userId, onClose }: UserDrawerProps): JSX.Element {
  const navigate = useNavigate();
  const { data: user, isLoading, isError, error, refetch } = useUser(userId ?? '');

  const tickets = user?.tickets ?? [];

  const infoItems: DescriptionsProps['items'] = user
    ? [
        {
          key: 'telegram_id',
          label: 'Telegram ID',
          children: <Typography.Text copyable={{ text: user.telegram_id }}>{user.telegram_id}</Typography.Text>,
        },
        { key: 'username', label: 'Username', children: user.username ? `@${user.username}` : '—' },
        { key: 'language', label: 'Language', children: user.language_code ?? '—' },
        {
          key: 'blocked',
          label: 'Blocked',
          children: user.is_blocked ? <Tag color="error">Yes</Tag> : <Tag color="success">No</Tag>,
        },
        { key: 'joined', label: 'Joined', children: formatDateTime(user.created_at) },
        {
          key: 'last_seen',
          label: 'Last seen',
          children: user.last_seen_at ? formatDateTime(user.last_seen_at) : '—',
        },
      ]
    : [];

  const openTicket = (ticket: Ticket): void => {
    onClose();
    navigate(`/tickets/${ticket.id}`);
  };

  return (
    <Drawer
      open={userId != null}
      onClose={onClose}
      width="min(92vw, 520px)"
      title={user ? userDisplayName(user) : 'User details'}
    >
      {isLoading && (
        <EmptyState icon={<UserOutlined />} title="Loading user…" description="Fetching profile and tickets." />
      )}

      {isError && !user && (
        <EmptyState
          icon={<UserOutlined />}
          title="Could not load this user"
          description={getApiErrorMessage(error)}
          action={
            <Space>
              <Typography.Link onClick={() => void refetch()}>Retry</Typography.Link>
              <Typography.Text type="secondary">·</Typography.Text>
              <Typography.Link onClick={onClose}>
                Close
              </Typography.Link>
            </Space>
          }
        />
      )}

      {user && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions column={1} size="small" bordered items={infoItems} />
          <Typography.Title level={5} style={{ margin: 0 }}>
            Tickets ({tickets.length})
          </Typography.Title>
          {tickets.length === 0 && (
            <EmptyState
              icon={<FileTextOutlined />}
              title="No tickets yet"
              description="This user hasn't opened any ticket — the first message they send to the bot will create one."
            />
          )}
          <List
            dataSource={tickets}
            renderItem={(ticket) => (
              <List.Item style={{ padding: '2px 0' }}>
                {/* A REAL button (review fix): native Enter AND Space activation,
                    a proper role for screen readers, and a focus ring — the
                    previous role="button" on List.Item only handled Enter and
                    left Space scrolling the drawer. */}
                <Button
                  type="text"
                  block
                  className="ab-ticket-button"
                  aria-label={`Open ticket ${ticket.ticket_number}`}
                  onClick={() => openTicket(ticket)}
                >
                  <span className="ab-ticket-button__main">
                    <span className="ab-ticket-button__titleline">
                      <Typography.Text strong>{ticket.ticket_number}</Typography.Text>
                      <StatusBadge status={ticket.status} />
                    </span>
                    <Typography.Text
                      type="secondary"
                      className="ab-ticket-button__subject"
                      ellipsis
                    >
                      {ticket.subject ?? 'No subject'}
                    </Typography.Text>
                  </span>
                  <Tooltip title={formatDateTime(ticket.last_message_at)}>
                    <Typography.Text type="secondary" className="ab-ticket-button__last">
                      {dayjs(ticket.last_message_at).fromNow()}
                    </Typography.Text>
                  </Tooltip>
                </Button>
              </List.Item>
            )}
          />
        </Space>
      )}
    </Drawer>
  );
}
