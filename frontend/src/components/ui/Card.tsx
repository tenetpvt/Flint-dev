import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  raised?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  header,
  footer,
  className = '',
  raised = false,
  ...props
}) => {
  return (
    <div
      className={`rounded-xl border border-[var(--border-subtle)] ${
        raised ? 'bg-[var(--surface-raised)]' : 'bg-[var(--surface)]'
      } shadow-[var(--card-shadow)] transition-all duration-150 ${className}`}
      {...props}
    >
      {header && (
        <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center justify-between">
          {header}
        </div>
      )}
      <div className="p-4">{children}</div>
      {footer && (
        <div className="px-4 py-2.5 border-t border-[var(--border-subtle)] bg-[var(--surface-raised)]/40 rounded-b-xl flex items-center justify-between text-xs text-[var(--text-muted)]">
          {footer}
        </div>
      )}
    </div>
  );
};
