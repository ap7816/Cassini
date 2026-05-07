// Déclenche l'enrichissement iTunes/Deezer pour TOUTES les pistes de la liste.
// Les résultats apparaissent progressivement au fur et à mesure que chaque piste se résout.
// Le cache est en mémoire uniquement — rien n'est sauvegardé entre les sessions.

import { useState, useEffect } from 'react';
import type { TrackMeta } from './useTrackMeta';
import {
  enrichTrack, getEnriched, needsEnrichment,
  type EnrichedData,
} from './enrichMeta';

interface UseAutoEnrichOptions {
  paths: string[];
  getMeta: (path: string) => TrackMeta | null;
  enabled: boolean;
}

export interface EnrichProgress {
  phase: 'searching';
  done: number;
  total: number;
}

// Lance l'enrichissement en arrière-plan dès que les métadonnées de base sont disponibles
// Retourne un getter synchrone pour les données enrichies et un état de progression
export function useAutoEnrich({ paths, getMeta, enabled }: UseAutoEnrichOptions): {
  getEnriched: (path: string) => EnrichedData | null;
  progress: EnrichProgress | null;
} {
  const [progress, setProgress] = useState<EnrichProgress | null>(null);
  // Incrémenté à chaque résultat pour forcer un re-rendu et afficher les nouvelles couvertures
  const [, setTick] = useState(0);

  // Clé stable qui change uniquement quand l'ensemble des pistes change (évite les re-runs inutiles)
  const pathsKey = [...paths].sort().join('\x00');

  useEffect(() => {
    if (!enabled || !paths.length) return;

    // Filtre uniquement les pistes non encore tentées cette session
    const toEnrich = paths.filter(p => needsEnrichment(p));
    if (!toEnrich.length) return;

    let cancelled = false;
    let searchDone = 0;
    setProgress({ phase: 'searching', done: 0, total: toEnrich.length });

    const enrichPromises = toEnrich.map(path => {
      const meta    = getMeta(path);
      const rawTitle =
        meta?.title ??
        path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ??
        '';
      // Si on a un tag artiste ET que le titre ne contient pas déjà " - ", on préfixe l'artiste
      // pour que le scoreur Rust puisse vérifier les deux parties indépendamment (plus strict)
      const hasDash  = rawTitle.includes(' - ');
      const title    = (meta?.artist && !hasDash)
        ? `${meta.artist} - ${rawTitle}`
        : rawTitle;
      return enrichTrack(path, title).then(() => {
        if (cancelled) return;
        searchDone++;
        setProgress({ phase: 'searching', done: searchDone, total: toEnrich.length });
        // Affiche chaque résultat dès qu'il arrive plutôt que d'attendre la fin du lot
        setTick(n => n + 1);
      });
    });

    // Efface la barre de progression quand toutes les pistes sont traitées
    Promise.allSettled(enrichPromises).then(() => {
      if (!cancelled) setProgress(null);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pathsKey]);

  return { getEnriched, progress };
}
