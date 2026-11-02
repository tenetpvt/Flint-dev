import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Map,
  BarChart3,
  CircleDollarSign,
  Bell,
  ClipboardList,
  Video,
  Bus,
  Activity,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
} from 'lucide-react';
import { useLayout } from '../../context/LayoutContext';

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

const navItems: NavItem[] = [
  { path: '/command-center', label: 'Command center', icon: LayoutDashboard },
  { path: '/live-map', label: 'Live map', icon: Map },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/cost-budget', label: 'Cost & budget', icon: CircleDollarSign },
  { path: '/live-alerts', label: 'Live alerts', icon: Bell },
  { path: '/complaints', label: 'Complaints', icon: ClipboardList },
  { path: '/video-vault', label: 'Video vault', icon: Video },
  { path: '/fleet', label: 'Fleet', icon: Bus },
  { path: '/system-status', label: 'System status', icon: Activity },
];

export function Sidebar() {
  const { isCollapsed, toggleSidebar } = useLayout();
  const [isSimulationPaused, setIsSimulationPaused] = useState(false);

  return (
    <aside
      className={`h-screen fixed left-0 top-0 border-r border-[var(--border-subtle)] bg-[var(--surface)] flex flex-col py-3 z-50 transition-[width] duration-150 ease-out select-none ${
        isCollapsed ? 'w-[64px]' : 'w-[240px]'
      }`}
    >
      {/* Brand Header */}
      <div
        className={`flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 mb-2 ${
          isCollapsed ? 'px-2 flex-col gap-2' : 'px-4'
        }`}
      >
        {!isCollapsed ? (
          <div className="flex flex-col justify-center min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">
                FLINT
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-medium bg-[var(--surface-raised)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                v2.4
              </span>
            </div>
            <span className="text-[11px] text-[var(--text-muted)] truncate">
              Urban sensing platform
            </span>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-md bg-[var(--surface-raised)] border border-[var(--border-subtle)] flex items-center justify-center text-xs font-semibold text-[var(--text-primary)]">
            FL
          </div>
        )}

        <button
          onClick={toggleSidebar}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="w-7 h-7 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] flex items-center justify-center transition-colors duration-150 cursor-pointer"
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
          ) : (
            <ChevronLeft className="w-4 h-4" strokeWidth={1.5} />
          )}
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto px-2 space-y-0.5 mt-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              title={isCollapsed ? item.label : undefined}
              className={({ isActive }) =>
                `relative flex items-center rounded-md text-[13px] font-medium transition-colors duration-150 cursor-pointer ${
                  isCollapsed ? 'justify-center h-9 w-full' : 'h-9 px-2.5 gap-2.5'
                } ${
                  isActive
                    ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)]/60'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* Subtle 2px active indicator bar */}
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-[var(--accent)]" />
                  )}
                  <Icon
                    className={`w-[17px] h-[17px] shrink-0 transition-colors ${
                      isActive ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)]'
                    }`}
                    strokeWidth={1.5}
                  />
                  {!isCollapsed && (
                    <span className="truncate leading-none">{item.label}</span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer: Quiet Simulation Mode Indicator */}
      <div className="px-2 pt-2 border-t border-[var(--border-subtle)] mt-auto">
        {!isCollapsed ? (
          <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-[var(--surface-raised)]/50 border border-[var(--border-subtle)] text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  isSimulationPaused ? 'bg-[#EAB308]' : 'bg-[#34D399]'
                }`}
              />
              <span className="text-[11px] text-[var(--text-secondary)] truncate">
                {isSimulationPaused ? 'Simulation paused' : 'Simulation active'}
              </span>
            </div>
            <button
              onClick={() => setIsSimulationPaused((p) => !p)}
              title={isSimulationPaused ? 'Resume simulation' : 'Pause simulation'}
              aria-label={isSimulationPaused ? 'Resume simulation' : 'Pause simulation'}
              className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded hover:bg-[var(--surface-raised)] transition-colors cursor-pointer"
            >
              {isSimulationPaused ? (
                <Play className="w-3.5 h-3.5" strokeWidth={1.5} />
              ) : (
                <Pause className="w-3.5 h-3.5" strokeWidth={1.5} />
              )}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsSimulationPaused((p) => !p)}
            title={`Simulation ${isSimulationPaused ? 'paused' : 'active'}`}
            aria-label={`Simulation ${isSimulationPaused ? 'paused' : 'active'}`}
            className="w-full h-8 flex items-center justify-center rounded-md hover:bg-[var(--surface-raised)] text-[var(--text-muted)] transition-colors cursor-pointer"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isSimulationPaused ? 'bg-[#EAB308]' : 'bg-[#34D399]'
              }`}
            />
          </button>
        )}
      </div>
    </aside>
  );
}
