import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAnalyticsSummary } from '../../services/analytics';
import { fetchAlerts } from '../../services/alerts';
import {
  ShieldCheck,
  Building2,
  ExternalLink,
  Database,
  Check,
  MapPin,
  Briefcase
} from 'lucide-react';

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [activeRole, setActiveRole] = useState<'EXECUTIVE_ENGINEER' | 'FIELD_INSPECTOR'>('EXECUTIVE_ENGINEER');
  const profileRef = useRef<HTMLDivElement>(null);

  const { data: summary } = useQuery({ queryKey: ['analytics-summary'], queryFn: fetchAnalyticsSummary });
  const { data: alerts } = useQuery({ queryKey: ['alerts'], queryFn: fetchAlerts });

  const unreadAlertsCount = alerts?.filter(a => a.status === 'NEW').length || 0;

  // Close dropdown on click outside
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
    '/command-center': 'COMMAND CENTER',
    '/live-map': 'LIVE MAP',
    '/analytics': 'ANALYTICS',
    '/cost-budget': 'COST & BUDGET',
    '/live-alerts': 'LIVE ALERTS',
    '/complaints': 'COMPLAINTS',
    '/grievances': 'COMPLAINTS',
    '/video-vault': 'VIDEO VAULT',
    '/fleet': 'FLEET',
    '/system-status': 'SYSTEM STATUS',
  };

  const currentTitle = titleMap[location.pathname] || 'DASHBOARD';

  return (
    <header className="h-14 bg-[#0b0e14] border-b border-[#414752] flex justify-between items-center px-5 shrink-0 z-40 relative">
      <div className="flex items-center">
        <h2 className="font-['Inter'] text-[17px] font-bold text-[#e0e2ea] mr-3 tracking-tight">
          {currentTitle}
        </h2>
        <div className="h-4 w-px bg-[#414752] mx-3"></div>
        <span className="text-[#c0c7d4] font-['Inter'] text-xs">Raipur, Chhattisgarh</span>
        <div className="h-4 w-px bg-[#414752] mx-3"></div>
        <div className="flex items-center text-[#c0c7d4] font-['JetBrains_Mono'] text-[11px] space-x-2">
          <span className="w-2 h-2 rounded-full bg-[#a2c9ff] mr-1"></span>
          <span>
            {summary
              ? `${summary.active_buses}/6 Buses Online · ${summary.completed_routes} Route Completed · Last Report 3m ago`
              : 'Loading fleet status...'}
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-2 text-[#c0c7d4] relative">
        {/* Bell Icon: Routes directly to Live Alerts with unread indicator badge */}
        <button
          onClick={() => navigate('/live-alerts')}
          className="relative material-symbols-outlined hover:text-[#a2c9ff] transition-colors text-[20px] w-8 h-8 rounded-full hover:bg-[#272a30] flex items-center justify-center cursor-pointer"
          title="View Live Alerts"
        >
          notifications
          {unreadAlertsCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white font-['JetBrains_Mono'] text-[9px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center border-2 border-[#0b0e14] shadow-sm animate-pulse">
              {unreadAlertsCount}
            </span>
          )}
        </button>

        {/* Profile Icon: Floating Operator Dropdown Card */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setIsProfileOpen(prev => !prev)}
            className={`material-symbols-outlined transition-colors text-[20px] w-8 h-8 rounded-full flex items-center justify-center cursor-pointer ${
              isProfileOpen ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'hover:text-[#a2c9ff] hover:bg-[#272a30]'
            }`}
            title="Operator Profile & Authority"
          >
            account_circle
          </button>

          {/* Floating Operator Dropdown Menu */}
          {isProfileOpen && (
            <div className="absolute right-0 mt-2.5 w-84 bg-[#0d1117] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden z-50 divide-y divide-[#21262d]">
              {/* Operator Header */}
              <div className="p-4 bg-gradient-to-b from-[#161b22] to-[#0d1117]">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-600 to-cyan-400 p-0.5 shadow-md">
                      <div className="w-full h-full bg-[#0d1117] rounded-full flex items-center justify-center text-sky-400 font-bold text-xs font-['JetBrains_Mono']">
                        AS
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white tracking-tight leading-none">
                        Er. Alok Sharma
                      </h3>
                      <p className="text-[11px] text-[#8b949e] mt-1 flex items-center gap-1">
                        <Briefcase className="w-3 h-3 text-sky-400" />
                        Executive Engineer (Civil)
                      </p>
                    </div>
                  </div>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1 animate-pulse"></span>
                    ON DUTY
                  </span>
                </div>

                {/* Organization & Jurisdiction */}
                <div className="mt-3.5 pt-3 border-t border-[#21262d] space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between text-[#8b949e]">
                    <span className="flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-[#58a6ff]" />
                      Authority:
                    </span>
                    <span className="text-slate-200 font-medium">Raipur Municipal Corp · PWD</span>
                  </div>
                  <div className="flex items-center justify-between text-[#8b949e]">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-amber-400" />
                      Jurisdiction:
                    </span>
                    <span className="text-slate-200 font-medium font-['JetBrains_Mono']">NH-30 & GE Road</span>
                  </div>
                  <div className="flex items-center justify-between text-[#8b949e]">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      Clearance:
                    </span>
                    <span className="text-emerald-400 font-medium">Level 3 (Work Order Dispatch)</span>
                  </div>
                </div>
              </div>

              {/* Demo Role Switcher */}
              <div className="p-3 bg-[#0d1117]">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#8b949e] px-1 mb-2">
                  Simulation Role Perspective
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => setActiveRole('EXECUTIVE_ENGINEER')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium text-left flex items-center justify-between transition-colors cursor-pointer ${
                      activeRole === 'EXECUTIVE_ENGINEER'
                        ? 'bg-sky-500/15 text-sky-300 border border-sky-500/40'
                        : 'bg-[#161b22] text-[#8b949e] hover:text-white border border-[#21262d]'
                    }`}
                  >
                    <span>Exec. Engineer</span>
                    {activeRole === 'EXECUTIVE_ENGINEER' && <Check className="w-3 h-3 text-sky-400" />}
                  </button>
                  <button
                    onClick={() => setActiveRole('FIELD_INSPECTOR')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium text-left flex items-center justify-between transition-colors cursor-pointer ${
                      activeRole === 'FIELD_INSPECTOR'
                        ? 'bg-sky-500/15 text-sky-300 border border-sky-500/40'
                        : 'bg-[#161b22] text-[#8b949e] hover:text-white border border-[#21262d]'
                    }`}
                  >
                    <span>Field Inspector</span>
                    {activeRole === 'FIELD_INSPECTOR' && <Check className="w-3 h-3 text-sky-400" />}
                  </button>
                </div>
              </div>

              {/* Quick Navigation Links */}
              <div className="p-2 space-y-0.5 bg-[#0d1117]">
                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    navigate('/complaints');
                  }}
                  className="w-full px-2.5 py-2 text-xs text-[#c9d1d9] hover:text-white hover:bg-[#161b22] rounded-lg flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Briefcase className="w-3.5 h-3.5 text-sky-400" />
                    My Dispatched Complaints
                  </span>
                  <ExternalLink className="w-3 h-3 text-[#6e7681]" />
                </button>

                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    navigate('/system-status');
                  }}
                  className="w-full px-2.5 py-2 text-xs text-[#c9d1d9] hover:text-white hover:bg-[#161b22] rounded-lg flex items-center justify-between transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Database className="w-3.5 h-3.5 text-emerald-400" />
                    Cloud Database & Edge Health
                  </span>
                  <ExternalLink className="w-3 h-3 text-[#6e7681]" />
                </button>
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 bg-[#161b22] flex items-center justify-between text-[11px] text-[#8b949e]">
                <span className="font-['JetBrains_Mono'] text-[10px]">FLINT OS v2.4</span>
                <span className="text-sky-400/80">Raipur Smart City</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
