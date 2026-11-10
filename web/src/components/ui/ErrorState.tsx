import type { ReactNode } from "react";
import { AlertIcon } from "./icons";

export interface ErrorStateProps {
  title: string;
  message: string;
  action?: ReactNode;
}

export function ErrorState({ title, message, action }: ErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <span className="error-state__icon" aria-hidden="true">
        <AlertIcon />
      </span>
      <p className="error-state__title">{title}</p>
      <p>{message}</p>
      {action}
    </div>
  );
}
