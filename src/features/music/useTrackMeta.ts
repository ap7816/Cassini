import { useState, useEffect } from 'react';
import type { RefObject } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface TrackMeta {
  path: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  durationSecs: number | null;
  coverDataUrl: string | null;
  /** true once a cover-art fetch was attempted for this entry */
  coverLoaded: boolean;
}

// ── Session cache (max 300 entries, FIFO eviction) ────────────────────────────
const MAX_CACHE = 300;
const _cache = new Map<string, TrackMeta>();

function evict() {
  while (_cache.size >= MAX_CACHE) {
    const oldest = _cache.keys().next().value;
    if (oldest === undefined) break;
    _cache.delete(oldest);
  }
}

// ── Cover-art concurrency limiter (max 4 parallel Rust calls) ─────────────────
const MAX_COVER_CONCURRENT = 4;
let _coverActive = 0;
const _coverQueue: Array<() => void> = [];

function releaseCoverSlot() {
  _coverActive--;
  if (_coverQueue.length > 0) {
    _coverActive++;
    _coverQueue.shift()!();
  }
}

function runWithCoverLimit<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => fn().then(resolve, reject).finally(releaseCoverSlot);
    if (_coverActive < MAX_COVER_CONCURRENT) {
      _coverActive++;
      run();
    } else {
      _coverQueue.push(run);
    }
  });
}

// ── Data fetching ─────────────────────────────────────────────────────────────

/**
 * One parallelised Rust call for title/artist/album/duration (no cover art).
 * rayon processes all files simultaneously on the Rust side.
 */
async function fetchBasicBatch(paths: string[]): Promise<void> {
  if (!paths.length) return;
  try {
    const results = await invoke<TrackMeta[]>('get_tracks_basic_batch', { paths });
    for (const meta of results) {
      if (_cache.has(meta.path)) continue; // keep richer existing entries
      evict();
      _cache.set(meta.path, { ...meta, coverDataUrl: null, coverLoaded: false });
    }
  } catch {
    // Store empty entries so we don't retry on every render
    for (const path of paths) {
      if (!_cache.has(path)) {
        evict();
        _cache.set(path, {
          path, title: null, artist: null, album: null,
          durationSecs: null, coverDataUrl: null, coverLoaded: false,
        });
      }
    }
  }
}

/** Single Rust call that reads cover art for one track. Rate-limited. */
async function fetchCover(path: string): Promise<string | null> {
  const existing = _cache.get(path);
  if (existing?.coverLoaded) return existing.coverDataUrl;
  return runWithCoverLimit(async () => {
    try {
      const meta = await invoke<TrackMeta>('get_track_metadata', { path });
      const coverDataUrl = meta.coverDataUrl ?? null;
      const entry = _cache.get(path);
      if (entry) {
        entry.coverDataUrl = coverDataUrl;
        entry.coverLoaded = true;
      } else {
        evict();
        _cache.set(path, { ...meta, coverDataUrl, coverLoaded: true });
      }
      return coverDataUrl;
    } catch {
      const entry = _cache.get(path);
      if (entry) { entry.coverLoaded = true; entry.coverDataUrl = null; }
      return null;
    }
  });
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/**
 * Loads title/artist/album/duration for ALL given paths in a single
 * parallelised Rust call. Returns a getter + a loading flag.
 */
export function useBasicBatch(paths: string[]): {
  getMeta: (path: string) => TrackMeta | null;
  loading: boolean;
} {
  const [loading, setLoading] = useState(false);
  const [, bump] = useState(0); // forces re-render when batch completes
  const key = paths.join('\x00');

  useEffect(() => {
    const missing = paths.filter(p => !_cache.has(p));
    if (!missing.length) return;
    setLoading(true);
    fetchBasicBatch(missing).then(() => {
      setLoading(false);
      bump(n => n + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    getMeta: (path: string) => _cache.get(path) ?? null,
    loading,
  };
}

/**
 * Loads cover art lazily: fires the Rust call only when the referenced
 * element scrolls within 200 px of the viewport (IntersectionObserver).
 * At most MAX_COVER_CONCURRENT calls run simultaneously.
 */
export function useLazyCoverArt(
  path: string | null,
  ref: RefObject<HTMLElement | null>,
): string | null {
  const [cover, setCover] = useState<string | null>(() => {
    if (!path) return null;
    const e = _cache.get(path);
    return e?.coverLoaded ? (e.coverDataUrl ?? null) : null;
  });

  useEffect(() => {
    if (!path) { setCover(null); return; }
    const entry = _cache.get(path);
    if (entry?.coverLoaded) { setCover(entry.coverDataUrl ?? null); return; }
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        observer.disconnect();
        fetchCover(path).then(setCover);
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // ref is stable for the component lifetime — omit from deps intentionally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return cover;
}

/**
 * Loads all metadata (including cover art) for a single track.
 * Used by the mini-player where one track needs to be loaded immediately.
 */
export function useSingleMeta(path: string | null): TrackMeta | null {
  const [meta, setMeta] = useState<TrackMeta | null>(() =>
    path ? (_cache.get(path) ?? null) : null,
  );

  useEffect(() => {
    if (!path) { setMeta(null); return; }
    const existing = _cache.get(path);
    if (existing?.coverLoaded) { setMeta(existing); return; }
    let cancelled = false;
    fetchCover(path).then(() => {
      if (!cancelled) setMeta(_cache.get(path) ?? null);
    });
    return () => { cancelled = true; };
  }, [path]);

  return meta;
}
