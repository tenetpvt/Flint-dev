import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { CircleDollarSign } from 'lucide-react';
import { useLayout } from '../../context/LayoutContext';

interface NavItem {
  path: string;
  label: string;
  icon?: string;
  lucideIcon?: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { path: '/command-center', label: 'Command Center', icon: 'dashboard' },
  { path: '/live-map', label: 'Live Map', icon: 'map' },
  { path: '/analytics', label: 'Analytics', icon: 'analytics' },
  { path: '/cost-budget', label: 'Cost & Budget', lucideIcon: CircleDollarSign },
  { path: '/live-alerts', label: 'Live Alerts', icon: 'notifications_active' },
  { path: '/complaints', label: 'Complaints', icon: 'assignment_turned_in' },
  { path: '/video-vault', label: 'Video Vault', icon: 'videocam' },
  { path: '/fleet', label: 'Fleet', icon: 'directions_bus' },
  { path: '/system-status', label: 'System Status', icon: 'settings_applications' },
];


export function Sidebar() {
  const { isCollapsed, toggleSidebar } = useLayout();
  const [isPaused, setIsPaused] = useState(false);

  return (
    <nav
      className={`h-screen fixed left-0 top-0 border-r border-[#414752] bg-[#0b0e14] flex flex-col py-3 z-50 transition-all duration-300 ease-in-out ${
        isCollapsed ? 'w-[68px]' : 'w-[240px]'
      }`}
    >
      {/* Brand Header */}
      <div className={`flex items-center justify-between border-b border-[#414752]/50 pb-3 mb-2 ${
        isCollapsed ? 'px-3 flex-col gap-2' : 'px-4'
      }`}>
        {!isCollapsed ? (
          <div className="flex flex-col justify-center overflow-hidden">
            <h1 className="text-[26px] font-bold text-[#a2c9ff] tracking-tight leading-none mb-0.5 font-['Inter']">
              FLINT
            </h1>
            <span className="text-[#c0c7d4] text-[11px] font-['Inter'] tracking-tight whitespace-nowrap">
              Urban Sensing Platform
            </span>
          </div>
        ) : (
          <div className="w-9 h-9 rounded-lg bg-[#58a6ff]/20 border border-[#58a6ff]/40 flex items-center justify-center text-[#a2c9ff] font-bold text-lg">
            F
          </div>
        )}

        {/* Toggle Button */}
        <button
          onClick={toggleSidebar}
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          className="w-8 h-8 rounded-lg text-[#c0c7d4] hover:text-[#e0e2ea] hover:bg-[#272a30] flex items-center justify-center transition-colors cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">
            {isCollapsed ? 'chevron_right' : 'chevron_left'}
          </span>
        </button>
      </div>

      {/* Navigation Items */}
      <ul className="flex-1 flex flex-col space-y-1 px-2 mt-1">
        {navItems.map((item) => (
          <li key={item.path}>
            <NavLink
              to={item.path}
              title={isCollapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center transition-colors cursor-pointer rounded-lg text-[13px] font-medium font-['Inter'] ${
                  isCollapsed ? 'justify-center p-2.5' : 'px-3 py-2.5 gap-3'
                } ${
                  isActive
                    ? 'text-[#00315c] bg-[#58a6ff] font-semibold shadow-sm'
                    : 'text-[#c0c7d4] hover:bg-[#1c2025] hover:text-[#e0e2ea]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {item.lucideIcon ? (
                    <item.lucideIcon
                      className={`w-[20px] h-[20px] shrink-0 ${
                        isActive ? 'text-[#00315c]' : 'text-[#c0c7d4]'
                      }`}
                    />
                  ) : (
                    <span
                      className={`material-symbols-outlined text-[20px] shrink-0 ${
                        isActive ? 'text-[#00315c]' : ''
                      }`}
                      style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
                    >
                      {item.icon}
                    </span>
                  )}
                  {!isCollapsed && (
                    <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                      {item.label}
                    </span>
                  )}
                </>
              )}

            </NavLink>
          </li>
        ))}
      </ul>

      {/* Enhanced Simulation Status Widget */}
      <div className="px-2 mt-auto">
        {!isCollapsed ? (
          <div className="bg-[#181c21] p-3 rounded-lg border border-[#414752] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-[#ffba42]' : 'bg-[#a2c9ff] animate-pulse-ring'}`}></span>
                <span className="font-['JetBrains_Mono'] text-[10px] font-bold text-[#e0e2ea] uppercase tracking-wider">
                  {isPaused ? 'SIMULATION PAUSED' : 'SIMULATION ACTIVE'}
                </span>
              </div>
              <button
                onClick={() => setIsPaused(!isPaused)}
                className="text-[10px] font-['JetBrains_Mono'] px-1.5 py-0.5 rounded border border-[#414752] text-[#c0c7d4] hover:text-[#e0e2ea] hover:bg-[#272a30] transition-colors cursor-pointer uppercase"
              >
                {isPaused ? 'RESUME' : 'PAUSE'}
              </button>
            </div>
            <div className="flex flex-col text-[11px] text-[#8b949e] font-['Inter'] leading-tight pl-3.5">
              <span className="font-medium text-[#c0c7d4]">BUS-01 · NH-30 Simga</span>
              <span>{isPaused ? 'Paused at Simga' : 'Journey in progress'}</span>
            </div>
          </div>
        ) : (
          <div
            className="flex justify-center p-2 cursor-pointer hover:bg-[#181c21] rounded-lg transition-colors"
            title={`Simulation ${isPaused ? 'Paused' : 'Active'}: BUS-01 · NH-30`}
            onClick={() => setIsPaused(!isPaused)}
          >
            <div className={`w-3 h-3 rounded-full ${isPaused ? 'bg-[#ffba42]' : 'bg-[#a2c9ff] animate-pulse-ring'}`}></div>
          </div>
        )}
      </div>
    </nav>
  );
}
