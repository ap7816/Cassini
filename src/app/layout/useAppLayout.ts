import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

export type NavItem = { to: string; label: string };

// Lit la largeur initiale de la fenêtre pour éviter un flash lors du premier rendu
function getInitialIsMobile(breakpointPx: number) {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < breakpointPx;
}

// Gère l'état de la sidebar (mobile/desktop), la fermeture automatique et le titre de page
export function useAppLayout(navItems: NavItem[], breakpointPx = 900) {
  const { pathname } = useLocation();

  const [isMobile, setIsMobile] = useState(() => getInitialIsMobile(breakpointPx));

  // On mémorise la route sur laquelle la sidebar a été ouverte plutôt qu'un
  // simple booléen. L'ouverture devient alors une valeur dérivée : changer de
  // route ou repasser en desktop la referme mécaniquement, sans effet qui
  // écrive dans l'état — ce qui provoquait un rendu en cascade à chaque
  // navigation.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const sidebarOpen = isMobile && openedOn === pathname;

  // Écoute les changements de taille de fenêtre pour basculer mobile/desktop
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const onChange = () => setIsMobile(mq.matches);

    onChange();

    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, [breakpointPx]);

  // Permet de fermer la sidebar avec la touche Échap
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenedOn(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  // Déduit le titre de la page courante à partir de la liste des items de navigation
  const pageTitle = useMemo(() => {
    const match = navItems.find((x) => pathname === x.to || pathname.startsWith(x.to + '/'));
    return match?.label ?? 'ArcHive';
  }, [pathname, navItems]);

  return {
    pathname,
    isMobile,
    sidebarOpen,
    pageTitle,
    openSidebar: () => setOpenedOn(pathname),
    closeSidebar: () => setOpenedOn(null),
  };
}
