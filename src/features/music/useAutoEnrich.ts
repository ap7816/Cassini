/**
 * useAutoEnrich.ts
 *
 * Fetches artist / album / coverUrl from iTunes → Deezer for ALL tracks.
 * Results appear progressively as each track resolves (no global gate).
 * Cache is in-memory only — nothing is saved between sessions.
 */

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

export function useAutoEnrich({ paths, getMeta, enabled }: UseAutoEnrichOptions): {
  getEnriched: (path: string) => EnrichedData | null;
  progress: EnrichProgress | null;
} {
  const [progress, setProgress] = useState<EnrichProgress | null>(null);
  const [, setTick] = useState(0); // force re-render when enriched data arrives

  const pathsKey = [...paths].sort().join('\x00');

  useEffect(() => {
    if (!enabled || !paths.length) return;

    // Enrich ALL tracks not yet attempted this session
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
      // If we have an artist tag AND the title doesn't already look like
      // "Artist - Title", prepend the artist so the Rust scorer can verify
      // both parts independently — much stricter than title-only matching.
      const hasDash  = rawTitle.includes(' - ');
      const title    = (meta?.artist && !hasDash)
        ? `${meta.artist} - ${rawTitle}`
        : rawTitle;
      return enrichTrack(path, title).then(() => {
        if (cancelled) return;
        searchDone++;
        setProgress({ phase: 'searching', done: searchDone, total: toEnrich.length });
        setTick(n => n + 1); // show each result as it arrives
      });
    });

    Promise.allSettled(enrichPromises).then(() => {
      if (!cancelled) setProgress(null);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pathsKey]);

  return { getEnriched, progress };
}
