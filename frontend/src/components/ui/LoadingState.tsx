export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-[var(--text-muted)] h-full space-y-3 select-none">
      <div className="w-5 h-5 border-[1.5px] border-[var(--border-strong)] border-t-[var(--accent)] rounded-full animate-spin" />
      <p className="text-xs text-[var(--text-muted)]">{message}</p>
    </div>
  );
}
