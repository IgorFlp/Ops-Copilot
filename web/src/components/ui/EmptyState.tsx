import type { ReactNode } from "react";
import { EmptyIcon } from "./icons";

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon" aria-hidden="true">
        {icon ?? <EmptyIcon />}
      </span>
      <p className="empty-state__title">{title}</p>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}
