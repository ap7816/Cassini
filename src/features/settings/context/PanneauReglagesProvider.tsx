import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PanneauReglagesContext } from './panneauReglagesContext';

const PanneauReglages = lazy(() =>
  import('../../../pages/Settings/PanneauReglages').then((m) => ({ default: m.PanneauReglages })),
);

/**
 * Les réglages, ouvrables d'où l'on veut.
 *
 * Ils ne changent plus de page : ils se posent par-dessus, pour ne pas démonter
 * la scène du système solaire et la reconstruire au retour. Le panneau vit donc
 * au-dessus des routes, et n'importe quel bouton peut l'appeler — la navigation
 * de gauche aujourd'hui, la barre des launchers qui lui survivra.
 *
 * Chargé à la première ouverture, et non au démarrage.
 */
export function PanneauReglagesProvider({ children }: { children: ReactNode }) {
  const [ouvert, setOuvert] = useState(false);
  const valeur = useMemo(() => ({ ouvert, ouvrir: () => setOuvert(true) }), [ouvert]);

  // `Ctrl+,` comme dans la plupart des applications. Les touches de vol du
  // système solaire sont des lettres nues : aucune collision.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== ',') return;
      e.preventDefault();
      setOuvert(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <PanneauReglagesContext.Provider value={valeur}>
      {children}
      {ouvert && (
        <Suspense fallback={null}>
          <PanneauReglages onFermer={() => setOuvert(false)} />
        </Suspense>
      )}
    </PanneauReglagesContext.Provider>
  );
}
