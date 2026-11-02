export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  badge?: number | string;
}

export interface SegmentedControlProps<T extends string | number> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (val: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  fullWidth?: boolean;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  size = 'sm',
  className = '',
  fullWidth = false,
}: SegmentedControlProps<T>) {
  const sizeClasses = size === 'sm' ? 'h-8 p-0.5 text-xs' : 'h-9 p-1 text-[13px]';
  const widthClasses = fullWidth ? 'w-full flex' : 'inline-flex';

  return (
    <div
      className={`${widthClasses} items-center rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] ${sizeClasses} ${className}`}
    >
      {options.map((opt) => {
        const isSelected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`h-full px-2.5 rounded-md font-medium transition-all duration-150 ease-out cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap select-none ${
              fullWidth ? 'flex-1' : ''
            } ${
              isSelected
                ? 'bg-[var(--surface)] text-[var(--text-primary)] shadow-xs border border-[var(--border-strong)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
            }`}
          >
            <span>{opt.label}</span>
            {opt.badge !== undefined && (
              <span
                className={`text-[10px] tabular-nums px-1.5 py-0.2 rounded-full ${
                  isSelected
                    ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] font-semibold'
                    : 'bg-[var(--surface)]/70 text-[var(--text-muted)]'
                }`}
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
