import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Input, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { TableProps } from 'antd';
import dayjs from 'dayjs';
import { useTickets } from '../api/hooks';
import { getApiErrorMessage } from '../api/client';
import { StatusBadge, TICKET_STATUS_OPTIONS } from '../components/StatusBadge';
import { DEPARTMENT_LABELS, formatDateTime, ticketUserLabel } from '../utils/format';
import type { TicketDepartment, TicketListItem, TicketStatus, TicketsFilters } from '../types';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 400;
const VALID_STATUSES: readonly TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'ANSWERED', 'CLOSED'];

function readFilters(searchParams: URLSearchParams): TicketsFilters {
  const statusParam = searchParams.get('status');
  const status = VALID_STATUSES.includes(statusParam as TicketStatus) ? (statusParam as TicketStatus) : '';
  const q = searchParams.get('q') ?? '';
  const pageParam = Number.parseInt(searchParams.get('page') ?? '1', 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  return { status, q, page, limit: PAGE_SIZE };
}

/**
 * Server-side paginated ticket list. Filters (status, q, page) are synced to
 * URL query params so refreshing (or sharing) the link keeps the exact state.
 */
export function TicketsPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => readFilters(searchParams), [searchParams]);

  const { data, isLoading, isFetching, isPlaceholderData, isError, error, refetch } = useTickets(filters);

  const [searchText, setSearchText] = useState(filters.q);
  const debounceRef = useRef<number | null>(null);

  // Keep the input in sync when the URL changes externally (back/forward nav).
  useEffect(() => {
    setSearchText(filters.q);
  }, [filters.q]);

  // Clear any pending debounce timer on unmount.
  useEffect(
    () => () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    },
    [],
  );

  const updateParams = (patch: Record<string, string | number | null>, options?: { replace?: boolean }): void => {
    // Read from window.location (not the captured searchParams) to avoid
    // dropping params committed after this closure was created.
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
    }
    setSearchParams(next, { replace: options?.replace ?? false });
  };

  const commitSearch = (value: string): void => {
    // Clear any pending debounce so immediate commits don't double-fire.
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const trimmed = value.trim();
    updateParams({ q: trimmed || null, page: null }, { replace: true });
  };

  const onSearchTextChange = (value: string): void => {
    setSearchText(value);
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => commitSearch(value), SEARCH_DEBOUNCE_MS);
  };

  const columns: TableProps<TicketListItem>['columns'] = [
    {
      title: 'Ticket #',
      dataIndex: 'ticket_number',
      key: 'ticket_number',
      width: 140,
      // The PRIMARY column carries a real button (review fix — a11y): full
      // keyboard support (Enter AND Space) and a proper control role, instead
      // of a fake-focusable table row. The row keeps its mouse-only click.
      render: (value: string, record) => (
        <Button
          type="link"
          className="ab-cell-link"
          aria-label={`Open ticket ${value}`}
          onClick={(event) => {
            event.stopPropagation();
            navigate(`/tickets/${record.id}`);
          }}
        >
          {value}
        </Button>
      ),
    },
    {
      title: 'Subject',
      dataIndex: 'subject',
      key: 'subject',
      ellipsis: true,
      render: (value: string | null) =>
        value ? <span>{value}</span> : <Typography.Text type="secondary" italic>No subject</Typography.Text>,
    },
    {
      title: 'Department',
      dataIndex: 'department',
      key: 'department',
      width: 130,
      ellipsis: true,
      render: (value: TicketDepartment | null) =>
        value ? (
          <Tag>{DEPARTMENT_LABELS[value]}</Tag>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: 'User',
      key: 'user',
      width: 180,
      ellipsis: true,
      render: (_, record) => ticketUserLabel(record.user, record.user_id),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (value: TicketStatus) => <StatusBadge status={value} />,
    },
    {
      title: 'Last Activity',
      dataIndex: 'last_message_at',
      key: 'last_message_at',
      width: 150,
      render: (value: string) => (
        <Tooltip title={formatDateTime(value)}>{dayjs(value).fromNow()}</Tooltip>
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} className="ab-page" style={{ width: '100%' }}>
      <div className="ab-page-header">
        <Typography.Title level={3} style={{ margin: 0 }}>
          Tickets
        </Typography.Title>
        <div className="ab-page-header__filters">
          <Select
            allowClear
            placeholder="All statuses"
            style={{ width: 170 }}
            value={filters.status || undefined}
            options={TICKET_STATUS_OPTIONS}
            onChange={(value) => updateParams({ status: value ?? null, page: null }, { replace: true })}
          />
          <Input.Search
            allowClear
            placeholder="Ticket number (e.g. TKT-10001)"
            style={{ width: 280 }}
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
            onSearch={commitSearch}
          />
        </div>
      </div>

      {isError && !data && (
        <Alert
          type="error"
          showIcon
          message="Failed to load tickets"
          description={getApiErrorMessage(error)}
          action={
            <Button size="small" onClick={() => void refetch()}>
              Retry
            </Button>
          }
        />
      )}

      <Card styles={{ body: { padding: 0 } }}>
        <Table<TicketListItem>
          rowKey="id"
          columns={columns}
          dataSource={data?.data ?? []}
          loading={isLoading || (isFetching && isPlaceholderData)}
          scroll={{ x: 'max-content' }}
          pagination={{
            current: filters.page,
            pageSize: filters.limit,
            total: data?.meta.total ?? 0,
            showSizeChanger: false,
            showTotal: (total, range) => `${range[0]}–${range[1]} of ${total}`,
            onChange: (page) => updateParams({ page: page === 1 ? null : page }),
          }}
          onRow={(record) => ({
            // Mouse convenience only — keyboard users use the real button in
            // the ticket-number column (review fix — no fake-focusable rows).
            onClick: () => navigate(`/tickets/${record.id}`),
            className: 'ab-row-clickable',
          })}
        />
      </Card>
    </Space>
  );
}
