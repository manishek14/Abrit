import { Badge } from 'antd';
import type { TicketStatus } from '../types';

const STATUS_BADGE_META: Record<TicketStatus, { status: 'processing' | 'warning' | 'default'; label: string }> = {
  OPEN: { status: 'processing', label: 'Open' }, // blue
  IN_PROGRESS: { status: 'warning', label: 'In Progress' }, // orange
  CLOSED: { status: 'default', label: 'Closed' }, // gray
};

export const TICKET_STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'CLOSED', label: 'Closed' },
];

export function statusLabel(status: TicketStatus): string {
  return STATUS_BADGE_META[status].label;
}

export function StatusBadge({ status }: { status: TicketStatus }): JSX.Element {
  const meta = STATUS_BADGE_META[status];
  return <Badge status={meta.status} text={meta.label} />;
}
