import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

export type NavItem = { to: string; label: string };

/**
 * Titre de la page courante, déduit de la liste des routes nommées.
 *
 * Ce crochet tenait aussi l'état du panneau de navigation — ouverture sur
 * mobile, repli sur écran large, fermeture à l'Échap. Ce panneau n'existe plus :
 * le système solaire porte sa propre navigation, dans sa barre des launchers.
 */
export function useAppLayout(navItems: NavItem[]) {
  const { pathname } = useLocation();

  const pageTitle = useMemo(() => {
    const match = navItems.find((x) => pathname === x.to || pathname.startsWith(x.to + '/'));
    return match?.label ?? 'Cassini';
  }, [pathname, navItems]);

  return { pathname, pageTitle };
}
