import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LayoutProvider, useLayout } from '../../context/LayoutContext';
import { ThemeProvider } from '../../context/ThemeContext';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';

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
        <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-[var(--bg-base)]">
          <div className="w-10 h-10 rounded-lg bg-[var(--surface-raised)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] mb-3">
            <AlertCircle className="w-5 h-5 text-amber-500" />
          </div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-1.5">
            Display mode recovery
          </h2>
          <p className="text-xs text-[var(--text-muted)] max-w-sm mb-4 leading-relaxed">
            The view encountered a rendering anomaly. Your session and telemetry remain active.
          </p>
          <Button
            size="sm"
            variant="secondary"
            icon={<RefreshCw className="w-3.5 h-3.5" />}
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
          >
            Reload view
          </Button>
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
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)] relative">
      {/* Aurora Light ambient background orbs */}
      <div className="aurora-bg-decor" aria-hidden="true">
        <div className="aurora-orb-violet" />
        <div className="aurora-orb-sky" />
        <div className="aurora-orb-mint" />
      </div>

      <Sidebar />
      <div
        className={`flex flex-col flex-1 overflow-hidden transition-[margin] duration-150 ease-out relative z-10 ${
          isCollapsed ? 'ml-[64px]' : 'ml-[240px]'
        }`}
      >
        <Header />
        <main className="flex-1 overflow-y-auto bg-transparent relative">
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
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <LayoutProvider>
          <MainLayoutContent />
        </LayoutProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
