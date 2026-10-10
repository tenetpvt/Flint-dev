export function ErrorState({ message, onRetry }: { message: string, onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center h-full">
      <h3 className="text-[#ffb4ab] font-semibold text-lg mb-2">UNABLE TO LOAD DATA</h3>
      <p className="text-[#8B949E] mb-6 max-w-sm">{message}</p>
      {onRetry && (
        <button 
          onClick={onRetry}
          className="px-4 py-2 bg-[#161B22] border border-[#30363D] text-[#58a6ff] rounded hover:bg-[#1C2128] transition-colors font-medium text-sm"
        >
          RETRY
        </button>
      )}
    </div>
  );
}
