import { useNavigate } from 'react-router-dom';
import {
  Descriptions,
  Drawer,
  List,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  type DescriptionsProps,
} from 'antd';
import dayjs from 'dayjs';
import { useUser } from '../api/hooks';
import { StatusBadge } from './StatusBadge';
import { formatDateTime, userDisplayName } from '../utils/format';

interface UserDrawerProps {
  userId: string | null;
  onClose: () => void;
}

/** Drawer showing a Telegram user's profile and their tickets (newest first). */
export function UserDrawer({ userId, onClose }: UserDrawerProps): JSX.Element {
  const navigate = useNavigate();
  const { data: user, isLoading } = useUser(userId ?? '');

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

  return (
    <Drawer open={userId != null} onClose={onClose} width={520} title={user ? userDisplayName(user) : 'User details'}>
      {isLoading && <Spin style={{ display: 'block', margin: '48px auto' }} />}
      {user && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Descriptions column={1} size="small" bordered items={infoItems} />
          <Typography.Title level={5} style={{ margin: 0 }}>
            Tickets ({tickets.length})
          </Typography.Title>
          {tickets.length === 0 && <Typography.Text type="secondary">No tickets yet.</Typography.Text>}
          <List
            dataSource={tickets}
            renderItem={(ticket) => (
              <List.Item
                style={{ cursor: 'pointer', padding: '8px 0' }}
                onClick={() => {
                  onClose();
                  navigate(`/tickets/${ticket.id}`);
                }}
              >
                <List.Item.Meta
                  title={
                    <Space size={8}>
                      <Typography.Text strong>{ticket.ticket_number}</Typography.Text>
                      <StatusBadge status={ticket.status} />
                    </Space>
                  }
                  description={ticket.subject ?? 'No subject'}
                />
                <Tooltip title={formatDateTime(ticket.last_message_at)}>
                  <Typography.Text type="secondary">{dayjs(ticket.last_message_at).fromNow()}</Typography.Text>
                </Tooltip>
              </List.Item>
            )}
          />
        </Space>
      )}
    </Drawer>
  );
}
