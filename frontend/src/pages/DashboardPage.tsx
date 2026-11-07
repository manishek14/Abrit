import type { ReactNode } from 'react';
import { Alert, Button, Card, Col, Row, Space, Statistic, Tag, Tooltip, Typography } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  InboxOutlined,
  MessageOutlined,
  PlusCircleOutlined,
  StopOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useDashboardStats } from '../api/hooks';
import { getApiErrorMessage } from '../api/client';
import { useSocket } from '../context/SocketContext';

interface StatCard {
  key: string;
  title: string;
  value: number | undefined;
  icon: ReactNode;
  color: string;
}

export function DashboardPage(): JSX.Element {
  const statsQuery = useDashboardStats();
  const { connected } = useSocket();
  const stats = statsQuery.data;

  const cards: StatCard[] = [
    { key: 'total', title: 'Total tickets', value: stats?.tickets.total, icon: <InboxOutlined />, color: '#1677ff' },
    { key: 'open', title: 'Open', value: stats?.tickets.open, icon: <MessageOutlined />, color: '#1677ff' },
    { key: 'in_progress', title: 'In progress', value: stats?.tickets.inProgress, icon: <ClockCircleOutlined />, color: '#fa8c16' },
    { key: 'answered', title: 'Answered', value: stats?.tickets.answered, icon: <CheckCircleOutlined />, color: '#52c41a' },
    { key: 'closed', title: 'Closed', value: stats?.tickets.closed, icon: <StopOutlined />, color: '#8c8c8c' },
    { key: 'today', title: "Today's new", value: stats?.tickets.today, icon: <PlusCircleOutlined />, color: '#52c41a' },
    { key: 'users', title: 'Telegram users', value: stats?.users.total, icon: <TeamOutlined />, color: '#722ed1' },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <Typography.Title level={3} style={{ margin: 0 }}>
          Dashboard
        </Typography.Title>
        {stats && (
          <Tooltip
            title={connected ? 'Realtime updates active.' : 'Auto-refreshes every 30 seconds while realtime is offline.'}
          >
            <Tag>
              Updated {dayjs(stats.updatedAt).format('HH:mm:ss')} · {stats.timezone}
            </Tag>
          </Tooltip>
        )}
      </div>

      {statsQuery.isError && !stats && (
        <Alert
          type="error"
          showIcon
          message="Failed to load dashboard statistics"
          description={getApiErrorMessage(statsQuery.error)}
          action={
            <Button size="small" onClick={() => void statsQuery.refetch()}>
              Retry
            </Button>
          }
        />
      )}

      <Row gutter={[16, 16]}>
        {cards.map((card) => (
          <Col key={card.key} xs={24} sm={12} lg={8}>
            <Card>
              <Statistic
                title={card.title}
                value={card.value ?? 0}
                loading={!stats}
                prefix={<span style={{ color: card.color, marginRight: 8 }}>{card.icon}</span>}
                valueStyle={{ color: card.color, fontWeight: 600 }}
              />
            </Card>
          </Col>
        ))}
      </Row>
    </Space>
  );
}
