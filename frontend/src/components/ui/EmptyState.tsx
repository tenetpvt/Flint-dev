import React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center text-[var(--text-muted)] ${className}`}
    >
      {icon && (
        <div className="mb-2 text-[var(--text-muted)] opacity-70 flex items-center justify-center">
          {icon}
        </div>
      )}
      {title && (
        <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-1">
          {title}
        </h4>
      )}
      <p className="text-xs text-[var(--text-muted)] max-w-xs">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
};
