import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LayoutProvider, useLayout } from '../../context/LayoutContext';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled view rendering error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-[#0A0C10]">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 shadow-lg">
            <span className="material-symbols-outlined text-[32px]">warning</span>
          </div>
          <h2 className="text-base font-bold text-white mb-2">Display Mode Recovery</h2>
          <p className="text-xs text-[#8b949e] max-w-md mb-5 leading-relaxed">
            The view encountered a rendering anomaly. The platform has automatically isolated the issue to keep your session and telemetry active.
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-[#002447] text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-md"
          >
            Reload View
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
    },
  },
});

function MainLayoutContent() {
  const { isCollapsed } = useLayout();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0A0C10]">
      <Sidebar />
      <div
        className={`flex flex-col flex-1 overflow-hidden transition-all duration-300 ease-in-out ${
          isCollapsed ? 'ml-[68px]' : 'ml-[240px]'
        }`}
      >
        <Header />
        <main className="flex-1 overflow-y-auto bg-[#0A0C10]">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export function Layout() {
  return (
    <QueryClientProvider client={queryClient}>
      <LayoutProvider>
        <MainLayoutContent />
      </LayoutProvider>
    </QueryClientProvider>
  );
}
