import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

export type NavItem = { to: string; label: string };

function getInitialIsMobile(breakpointPx: number) {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < breakpointPx;
}

export function useAppLayout(navItems: NavItem[], breakpointPx = 900) {
  const { pathname } = useLocation();

  const [isMobile, setIsMobile] = useState(() => getInitialIsMobile(breakpointPx));
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => {
      const matches = 'matches' in e ? e.matches : mq.matches;
      setIsMobile(matches);
      if (!matches) setSidebarOpen(false);
    };

    onChange(mq);

    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange as any);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange as any);
    };
  }, [breakpointPx]);

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [pathname, isMobile]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  const pageTitle = useMemo(() => {
    const match = navItems.find((x) => pathname === x.to || pathname.startsWith(x.to + '/'));
    return match?.label ?? 'ArcHive';
  }, [pathname, navItems]);

  return {
    pathname,
    isMobile,
    sidebarOpen,
    pageTitle,
    openSidebar: () => setSidebarOpen(true),
    closeSidebar: () => setSidebarOpen(false),
  };
}
