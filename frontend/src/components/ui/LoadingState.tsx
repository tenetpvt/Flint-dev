export function LoadingState({ message = "Loading data..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-[#8B949E] h-full space-y-4">
      <div className="w-8 h-8 border-2 border-[#30363D] border-t-[#58a6ff] rounded-full animate-spin"></div>
      <p className="text-sm font-['JetBrains_Mono']">{message}</p>
    </div>
  );
}
