import React from 'react';

export interface ToolbarProps {
  children: React.ReactNode;
  className?: string;
}

export const Toolbar: React.FC<ToolbarProps> = ({ children, className = '' }) => {
  return (
    <div
      className={`h-12 px-4 bg-[var(--surface)] border-b border-[var(--border-subtle)] flex items-center justify-between gap-3 shrink-0 ${className}`}
    >
      {children}
    </div>
  );
};
