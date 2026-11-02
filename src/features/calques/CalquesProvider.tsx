import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CalquesContext, type Calque } from './calquesContext';

const PanneauReglages = lazy(() =>
  import('../../pages/Settings/PanneauReglages').then((m) => ({ default: m.PanneauReglages })),
);

const PanneauMusique = lazy(() =>
  import('../../pages/Music/PanneauMusique').then((m) => ({ default: m.PanneauMusique })),
);

/**
 * Les calques posés sur l'application : réglages, musique.
 *
 * Aucun ne change de page. Aller les chercher par une route démontait la scène
 * du système solaire pour la reconstruire au retour, et surtout : c'est la vue
 * qui doit tout contenir, pas une navigation par-dessus elle.
 *
 * Ils vivent donc au-dessus des routes, et n'importe quel bouton peut les
 * appeler — la barre des launchers aujourd'hui.
 */
export function CalquesProvider({ children }: { children: ReactNode }) {
  const [ouvert, setOuvert] = useState<Calque | null>(null);

  const valeur = useMemo(
    () => ({
      ouvert,
      ouvrir: (calque: Calque) => setOuvert(calque),
      basculer: (calque: Calque) => setOuvert((v) => (v === calque ? null : calque)),
      fermer: () => setOuvert(null),
    }),
    [ouvert],
  );

  // Leur code n'est chargé qu'à la première ouverture, ce qui coûtait une
  // attente avant que le calque apparaisse. On le précharge dès que
  // l'application n'a plus rien d'urgent — au repos plutôt qu'après un délai
  // fixe : le démarrage a déjà fort à faire, entre le scan des launchers et le
  // montage de la scène.
  useEffect(() => {
    let annule = false;
    const precharger = () => {
      if (annule) return;
      void import('../../pages/Settings/PanneauReglages');
      void import('../../pages/Music/PanneauMusique');
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

  // `Ctrl+,` pour les réglages, `Ctrl+M` pour la musique, comme ailleurs. Les
  // touches de vol du système solaire sont des lettres nues : aucune collision.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === ',') {
        e.preventDefault();
        setOuvert('reglages');
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setOuvert((v) => (v === 'musique' ? null : 'musique'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <CalquesContext.Provider value={valeur}>
      {children}
      {ouvert !== null && (
        <Suspense fallback={null}>
          {ouvert === 'reglages' ? (
            <PanneauReglages onFermer={valeur.fermer} />
          ) : (
            <PanneauMusique onFermer={valeur.fermer} />
          )}
        </Suspense>
      )}
    </CalquesContext.Provider>
  );
}
