import React from 'react';

export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export const GlassPanel: React.FC<GlassPanelProps> = ({
  children,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`glass-panel pointer-events-auto transition-all duration-150 ease-out text-[var(--text-primary)] ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
