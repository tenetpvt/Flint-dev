import React from 'react';

export interface Column<T> {
  key: string;
  header: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
  render?: (item: T, index: number) => React.ReactNode;
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string | number;
  onRowClick?: (item: T) => void;
  selectedKey?: string | number | null;
  emptyState?: React.ReactNode;
  className?: string;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  selectedKey,
  emptyState,
  className = '',
}: TableProps<T>) {
  if (data.length === 0 && emptyState) {
    return <div className="p-8 text-center">{emptyState}</div>;
  }

  return (
    <div className={`overflow-x-auto w-full ${className}`}>
      <table className="w-full text-left border-collapse">
        <thead className="sticky top-0 z-10 bg-[var(--surface-raised)] border-b border-[var(--border-subtle)]">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width }}
                className={`py-2 px-3 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-[0.04em] ${
                  col.align === 'right'
                    ? 'text-right'
                    : col.align === 'center'
                    ? 'text-center'
                    : 'text-left'
                }`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)] text-[13px]">
          {data.map((item, idx) => {
            const key = keyExtractor(item);
            const isSelected = selectedKey !== undefined && selectedKey === key;
            return (
              <tr
                key={key}
                onClick={() => onRowClick && onRowClick(item)}
                className={`h-11 transition-colors duration-150 ${
                  onRowClick ? 'cursor-pointer' : ''
                } ${
                  isSelected
                    ? 'bg-[var(--surface-raised)] border-l-2 border-l-[var(--accent)]'
                    : 'hover:bg-[var(--surface-raised)]/60'
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`py-2 px-3 text-[var(--text-primary)] ${
                      col.align === 'right'
                        ? 'text-right tabular-nums'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                    }`}
                  >
                    {col.render
                      ? col.render(item, idx)
                      : (item as Record<string, any>)[col.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
