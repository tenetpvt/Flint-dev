import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center h-full text-[var(--text-secondary)] select-none">
      <div className="w-9 h-9 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] mb-3">
        <AlertCircle className="w-4 h-4 text-[#F59E0B]" strokeWidth={1.5} />
      </div>
      <h3 className="text-xs font-semibold text-[var(--text-primary)] mb-1">
        Unable to load data
      </h3>
      <p className="text-xs text-[var(--text-muted)] max-w-xs mb-4">{message}</p>
      {onRetry && (
        <Button
          size="sm"
          variant="secondary"
          onClick={onRetry}
          icon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Try again
        </Button>
      )}
    </div>
  );
}
