import React from 'react';

export type StatusVariant =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'success'
  | 'info'
  | 'neutral';

export interface StatusDotProps {
  status: StatusVariant;
  label?: string;
  pulse?: boolean;
  className?: string;
  sublabel?: string;
}

const colorMap: Record<StatusVariant, { dot: string; text: string }> = {
  critical: { dot: 'bg-[#F0524F]', text: 'text-[#F0524F]' },
  high: { dot: 'bg-[#F59E0B]', text: 'text-[#F59E0B]' },
  medium: { dot: 'bg-[#EAB308]', text: 'text-[#EAB308]' },
  low: { dot: 'bg-[#6B7280]', text: 'text-[#6B7280]' },
  success: { dot: 'bg-[#34D399]', text: 'text-[#34D399]' },
  info: { dot: 'bg-[#4C8DFF]', text: 'text-[#4C8DFF]' },
  neutral: { dot: 'bg-[var(--text-muted)]', text: 'text-[var(--text-secondary)]' },
};

export const StatusDot: React.FC<StatusDotProps> = ({
  status,
  label,
  pulse = false,
  className = '',
  sublabel,
}) => {
  const conf = colorMap[status] || colorMap.neutral;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${className}`}>
      <span className="relative flex h-1.5 w-1.5 shrink-0 items-center justify-center">
        {pulse && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${conf.dot}`}
          />
        )}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${conf.dot}`} />
      </span>
      {label && <span className={conf.text}>{label}</span>}
      {sublabel && (
        <span className="text-[var(--text-muted)] font-normal text-[11px]">{sublabel}</span>
      )}
    </span>
  );
};
