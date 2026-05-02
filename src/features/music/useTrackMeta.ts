import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface TrackMeta {
  title: string | null;
  artist: string | null;
  album: string | null;
  coverDataUrl: string | null;
}

// ── Session-level cache ───────────────────────────────────────────────────────
// Max 300 entries, FIFO eviction (Map preserves insertion order).
// Cleared automatically when the app process closes.
const MAX_CACHE = 300;
const _metaCache = new Map<string, TrackMeta | null>();

function evict() {
  while (_metaCache.size >= MAX_CACHE) {
    const oldest = _metaCache.keys().next().value;
    if (oldest === undefined) break;
    _metaCache.delete(oldest);
  }
}

async function fetchMeta(path: string): Promise<TrackMeta | null> {
  if (_metaCache.has(path)) return _metaCache.get(path)!;
  try {
    const result = await invoke<TrackMeta>('get_track_metadata', { path });
    evict();
    _metaCache.set(path, result);
    return result;
  } catch {
    evict();
    _metaCache.set(path, null);
    return null;
  }
}

// ── useSingleMeta ─────────────────────────────────────────────────────────────
/** Loads metadata for one track (used by the mini-player). */
export function useSingleMeta(path: string | null): TrackMeta | null {
  const [meta, setMeta] = useState<TrackMeta | null>(() =>
    path && _metaCache.has(path) ? (_metaCache.get(path) ?? null) : null,
  );

  useEffect(() => {
    if (!path) { setMeta(null); return; }
    if (_metaCache.has(path)) { setMeta(_metaCache.get(path) ?? null); return; }
    let cancelled = false;
    fetchMeta(path).then(m => { if (!cancelled) setMeta(m); });
    return () => { cancelled = true; };
  }, [path]);

  return meta;
}

// ── useBatchMeta ──────────────────────────────────────────────────────────────
/** Loads metadata for a list of paths in batches of 8 (used by the track grid).
 *  Returns a getter backed by the cache — call getMeta(path) in the render. */
export function useBatchMeta(paths: string[]): (path: string) => TrackMeta | null {
  const [, setRev] = useState(0);

  // Stable key so the effect only fires when the path list actually changes.
  const key = paths.join('\x00');

  useEffect(() => {
    const missing = paths.filter(p => !_metaCache.has(p));
    if (!missing.length) return;

    let cancelled = false;
    const BATCH = 8;
    let i = 0;

    async function next() {
      if (cancelled || i >= missing.length) return;
      const slice = missing.slice(i, i + BATCH);
      i += BATCH;
      await Promise.all(slice.map(fetchMeta));
      if (!cancelled) setRev(r => r + 1); // trigger re-render so caller sees new data
      next();
    }

    next();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (path: string) => _metaCache.get(path) ?? null;
}
