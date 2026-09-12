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

  // Le code des réglages n'est chargé qu'à la première ouverture, ce qui lui
  // coûtait trois cents millisecondes d'attente avant d'apparaître. On le
  // précharge dès que l'application n'a plus rien d'urgent — au repos plutôt
  // qu'après un délai fixe : le démarrage a déjà fort à faire, entre le scan
  // des launchers et le montage de la scène.
  useEffect(() => {
    let annule = false;
    const precharger = () => {
      if (!annule) void import('../../../pages/Settings/PanneauReglages');
    };

    if (typeof window.requestIdleCallback === 'function') {
      // Au plus deux secondes d'attente : passé ce délai, mieux vaut charger
      // même si l'application s'affaire encore.
      const id = window.requestIdleCallback(precharger, { timeout: 2000 });
      return () => {
        annule = true;
        window.cancelIdleCallback(id);
      };
    }

    const id = window.setTimeout(precharger, 2000);
    return () => {
      annule = true;
      window.clearTimeout(id);
    };
  }, []);

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
