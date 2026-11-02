import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAnalyticsSummary } from '../../services/analytics';
import { fetchAlerts } from '../../services/alerts';
import { useTheme } from '../../context/ThemeContext';
import {
  Bell,
  Sun,
  Moon,
  Monitor,
  User,
  ShieldCheck,
  Building2,
  MapPin,
  Briefcase,
  Check,
  ExternalLink,
  Database,
} from 'lucide-react';

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { mode, setMode } = useTheme();

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [activeRole, setActiveRole] = useState<'EXECUTIVE_ENGINEER' | 'FIELD_INSPECTOR'>(
    'EXECUTIVE_ENGINEER'
  );
  const profileRef = useRef<HTMLDivElement>(null);

  const { data: summary } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: fetchAnalyticsSummary,
  });
  const { data: alerts } = useQuery({ queryKey: ['alerts'], queryFn: fetchAlerts });

  const unreadAlertsCount = alerts?.filter((a) => a.status === 'NEW').length || 0;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    if (isProfileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileOpen]);

  const titleMap: Record<string, string> = {
    '/command-center': 'Command center',
    '/live-map': 'Live map',
    '/analytics': 'Analytics',
    '/cost-budget': 'Cost & budget',
    '/live-alerts': 'Live alerts',
    '/complaints': 'Complaints',
    '/grievances': 'Complaints',
    '/video-vault': 'Video vault',
    '/fleet': 'Fleet',
    '/system-status': 'System status',
  };

  const currentTitle = titleMap[location.pathname] || 'Dashboard';

  return (
    <header className="h-12 bg-[var(--surface)] border-b border-[var(--border-subtle)] flex justify-between items-center px-4 shrink-0 z-40 relative select-none">
      {/* Left Title & Fleet Status */}
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">
          {currentTitle}
        </h1>
        <span className="text-[var(--border-strong)]">/</span>
        <span className="text-xs text-[var(--text-secondary)]">Raipur, Chhattisgarh</span>
        <span className="text-[var(--border-strong)] hidden md:inline">/</span>
        <div className="hidden md:flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
          <span>
            {summary
              ? `${summary.active_buses} of 6 buses online · ${summary.completed_routes} routes completed`
              : 'Connecting fleet...'}
          </span>
        </div>
      </div>

      {/* Right Controls: Notifications & User Profile */}
      <div className="flex items-center gap-1 text-[var(--text-secondary)]">
        {/* Notifications */}
        <button
          onClick={() => navigate('/live-alerts')}
          className="relative w-8 h-8 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors duration-150 cursor-pointer"
          title="Live alerts"
          aria-label="Live alerts"
        >
          <Bell className="w-4 h-4" strokeWidth={1.5} />
          {unreadAlertsCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#F0524F]" />
          )}
        </button>

        {/* User Menu Dropdown */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setIsProfileOpen((p) => !p)}
            className={`w-8 h-8 rounded-md flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors duration-150 cursor-pointer ${
              isProfileOpen ? 'bg-[var(--surface-raised)] text-[var(--text-primary)]' : ''
            }`}
            title="User menu"
            aria-label="User menu"
          >
            <User className="w-4 h-4" strokeWidth={1.5} />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-[var(--surface)] border border-[var(--border-subtle)] rounded-xl shadow-xl overflow-hidden z-50 divide-y divide-[var(--border-subtle)]">
              {/* User Identity */}
              <div className="p-3.5 bg-[var(--surface-raised)]/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[var(--surface-raised)] border border-[var(--border-strong)] flex items-center justify-center text-xs font-semibold text-[var(--accent)] font-mono">
                      AS
                    </div>
                    <div>
                      <h2 className="text-xs font-semibold text-[var(--text-primary)] leading-tight">
                        Er. Alok Sharma
                      </h2>
                      <p className="text-[11px] text-[var(--text-muted)] flex items-center gap-1 mt-0.5">
                        <Briefcase className="w-3 h-3" strokeWidth={1.5} />
                        Executive Engineer (Civil)
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    Active
                  </span>
                </div>

                <div className="mt-3 pt-2.5 border-t border-[var(--border-subtle)] space-y-1 text-[11px] text-[var(--text-muted)]">
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-3 h-3" strokeWidth={1.5} />
                      Authority
                    </span>
                    <span className="text-[var(--text-secondary)] font-medium">
                      Raipur Municipal Corp · PWD
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" strokeWidth={1.5} />
                      Jurisdiction
                    </span>
                    <span className="font-mono text-[var(--text-secondary)]">NH-30 & GE Road</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3 h-3" strokeWidth={1.5} />
                      Clearance
                    </span>
                    <span className="text-[var(--accent)]">Level 3 (Work order dispatch)</span>
                  </div>
                </div>
              </div>

              {/* Appearance Mode Selector (Light, Dark, System) */}
              <div className="p-2">
                <div className="text-[10px] font-medium text-[var(--text-muted)] px-2 py-1">
                  Appearance
                </div>
                <div className="grid grid-cols-3 gap-1 px-1">
                  <button
                    onClick={() => setMode('light')}
                    className={`px-2 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      mode === 'light'
                        ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] font-semibold border border-[var(--border-strong)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    <Sun className="w-3 h-3" strokeWidth={1.5} />
                    <span>Light</span>
                  </button>
                  <button
                    onClick={() => setMode('dark')}
                    className={`px-2 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      mode === 'dark'
                        ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] font-semibold border border-[var(--border-strong)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    <Moon className="w-3 h-3" strokeWidth={1.5} />
                    <span>Dark</span>
                  </button>
                  <button
                    onClick={() => setMode('system')}
                    className={`px-2 py-1.5 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      mode === 'system'
                        ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] font-semibold border border-[var(--border-strong)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    <Monitor className="w-3 h-3" strokeWidth={1.5} />
                    <span>System</span>
                  </button>
                </div>
              </div>

              {/* Perspective Role Switcher */}
              <div className="p-2">
                <div className="text-[10px] font-medium text-[var(--text-muted)] px-2 py-1">
                  Perspective
                </div>
                <div className="grid grid-cols-2 gap-1 px-1">
                  <button
                    onClick={() => setActiveRole('EXECUTIVE_ENGINEER')}
                    className={`px-2 py-1.5 rounded-md text-xs font-medium text-left flex items-center justify-between transition-colors cursor-pointer ${
                      activeRole === 'EXECUTIVE_ENGINEER'
                        ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] font-semibold border border-[var(--border-strong)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    <span>Exec. engineer</span>
                    {activeRole === 'EXECUTIVE_ENGINEER' && (
                      <Check className="w-3 h-3 text-[var(--accent)]" strokeWidth={2} />
                    )}
                  </button>
                  <button
                    onClick={() => setActiveRole('FIELD_INSPECTOR')}
                    className={`px-2 py-1.5 rounded-md text-xs font-medium text-left flex items-center justify-between transition-colors cursor-pointer ${
                      activeRole === 'FIELD_INSPECTOR'
                        ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] font-semibold border border-[var(--border-strong)]'
                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                    }`}
                  >
                    <span>Field inspector</span>
                    {activeRole === 'FIELD_INSPECTOR' && (
                      <Check className="w-3 h-3 text-[var(--accent)]" strokeWidth={2} />
                    )}
                  </button>
                </div>
              </div>

              {/* Navigation Shortcuts */}
              <div className="p-1.5 space-y-0.5">
                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    navigate('/complaints');
                  }}
                  className="w-full px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] rounded-md flex items-center justify-between transition-colors duration-150 cursor-pointer"
                >
                  <span>My dispatched complaints</span>
                  <ExternalLink className="w-3 h-3 text-[var(--text-muted)]" strokeWidth={1.5} />
                </button>
                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    navigate('/system-status');
                  }}
                  className="w-full px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] rounded-md flex items-center justify-between transition-colors duration-150 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Database className="w-3 h-3" strokeWidth={1.5} />
                    Cloud database & health
                  </span>
                  <ExternalLink className="w-3 h-3 text-[var(--text-muted)]" strokeWidth={1.5} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
