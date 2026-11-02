import React, { createContext, useContext, useState, useEffect } from 'react';

interface LayoutContextType {
  isCollapsed: boolean;
  toggleSidebar: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

const LayoutContext = createContext<LayoutContextType>({
  isCollapsed: false,
  toggleSidebar: () => {},
  setCollapsed: () => {},
});

export const LayoutProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (window.innerWidth < 1280) return true;
    const stored = localStorage.getItem('flint_sidebar_collapsed');
    return stored === 'true';
  });

  // Responsive listener: collapse under 1280px
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1280) {
        setIsCollapsed(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('flint_sidebar_collapsed', String(next));
      return next;
    });
  };

  const setCollapsed = (collapsed: boolean) => {
    setIsCollapsed(collapsed);
    localStorage.setItem('flint_sidebar_collapsed', String(collapsed));
  };

  // Dispatch custom event when layout transitions so MapLibre instances can call map.resize()
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 180);
    return () => clearTimeout(timer);
  }, [isCollapsed]);

  return (
    <LayoutContext.Provider value={{ isCollapsed, toggleSidebar, setCollapsed }}>
      {children}
    </LayoutContext.Provider>
  );
};

export const useLayout = () => useContext(LayoutContext);
