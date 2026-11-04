import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Input, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { TableProps } from 'antd';
import dayjs from 'dayjs';
import { useUsers } from '../api/hooks';
import { getApiErrorMessage } from '../api/client';
import { UserDrawer } from '../components/UserDrawer';
import { formatDateTime } from '../utils/format';
import type { TelegramUser, UsersFilters } from '../types';

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 400;

export function UsersPage(): JSX.Element {
  const [searchText, setSearchText] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);

  const debounceRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    },
    [],
  );

  const onSearchChange = (value: string): void => {
    setSearchText(value);
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setDebouncedQuery(value.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
  };

  const filters = useMemo<UsersFilters>(
    () => ({ q: debouncedQuery, page, limit: PAGE_SIZE }),
    [debouncedQuery, page],
  );

  const { data, isLoading, isFetching, isPlaceholderData, isError, error, refetch } = useUsers(filters);

  const columns: TableProps<TelegramUser>['columns'] = [
    {
      title: 'Telegram ID',
      dataIndex: 'telegram_id',
      key: 'telegram_id',
      width: 180,
      render: (value: string) => <Typography.Text copyable={{ text: value }}>{value}</Typography.Text>,
    },
    {
      title: 'Username',
      dataIndex: 'username',
      key: 'username',
      width: 160,
      render: (value: string | null) => (value ? <span>@{value}</span> : '—'),
    },
    {
      title: 'Name',
      key: 'name',
      ellipsis: true,
      render: (_, record) => {
        const name = [record.first_name, record.last_name].filter(Boolean).join(' ').trim();
        return name ? <span>{name}</span> : '—';
      },
    },
    {
      title: 'Tickets',
      dataIndex: 'ticket_count',
      key: 'ticket_count',
      width: 90,
      align: 'right',
      render: (value: number | undefined) => value ?? 0,
    },
    {
      title: 'Blocked',
      dataIndex: 'is_blocked',
      key: 'is_blocked',
      width: 100,
      render: (value: boolean) => (value ? <Tag color="error">Yes</Tag> : <Tag color="success">No</Tag>),
    },
    {
      title: 'Joined',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 140,
      render: (value: string) => <Tooltip title={formatDateTime(value)}>{dayjs(value).fromNow()}</Tooltip>,
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Typography.Title level={3} style={{ margin: 0 }}>
          Telegram Users
        </Typography.Title>
        <Input.Search
          allowClear
          placeholder="Search username or name"
          style={{ width: 280 }}
          value={searchText}
          onChange={(event) => onSearchChange(event.target.value)}
          onSearch={(value) => {
            if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
            setDebouncedQuery(value.trim());
            setPage(1);
          }}
        />
      </div>

      {isError && !data && (
        <Alert
          type="error"
          showIcon
          message="Failed to load users"
          description={getApiErrorMessage(error)}
          action={
            <Button size="small" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        />
      )}

      <Card styles={{ body: { padding: 0 } }}>
        <Table<TelegramUser>
          rowKey="id"
          columns={columns}
          dataSource={data?.data ?? []}
          loading={isLoading || (isFetching && isPlaceholderData)}
          pagination={{
            current: filters.page,
            pageSize: filters.limit,
            total: data?.meta.total ?? 0,
            showSizeChanger: false,
            showTotal: (total, range) => `${range[0]}–${range[1]} of ${total}`,
            onChange: (nextPage) => setPage(nextPage),
          }}
          onRow={(record) => ({
            onClick: () => setActiveUserId(record.id),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>

      <UserDrawer userId={activeUserId} onClose={() => setActiveUserId(null)} />
    </Space>
  );
}
