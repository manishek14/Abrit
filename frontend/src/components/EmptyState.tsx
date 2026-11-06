import type { ReactNode } from 'react';
import { Typography } from 'antd';

interface EmptyStateProps {
  /** Decorative icon (aria-hidden); sized by the component. */
  icon: ReactNode;
  /** Short, human title — e.g. "Conversation hasn't started". */
  title: string;
  /** One-sentence explanation of what will appear here / what to do. */
  description?: string;
  /** Optional action, e.g. a Retry button. */
  action?: ReactNode;
}

/**
 * Shared placeholder for empty/error content — one visual language instead of
 * ad-hoc strings (review fix: empty states were plain text, error states
 * missing). Rendered with role="status" so screen readers announce it.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps): JSX.Element {
  return (
    <div className="ab-empty-state" role="status">
      <span className="ab-empty-state__icon" aria-hidden>
        {icon}
      </span>
      <Typography.Title level={5} className="ab-empty-state__title">
        {title}
      </Typography.Title>
      {description && (
        <Typography.Paragraph className="ab-empty-state__desc">{description}</Typography.Paragraph>
      )}
      {action}
    </div>
  );
}
