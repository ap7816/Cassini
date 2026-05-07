/**
 * enrichMeta.ts
 *
 * Fetches track metadata (artist, album, cover art URL) from iTunes → Deezer.
 *
 * - ALL tracks are searched on every app start (no artist-tag filter).
 * - Results are kept in memory only for the current session — nothing is
 *   written to disk or localStorage.
 * - At most MAX_CONCURRENT requests run in parallel.
 */

import { invoke, isTauri } from '@tauri-apps/api/core';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EnrichedData {
  /** Artist name found online, or null. */
  artist: string | null;
  /** Album name found online, or null. */
  album: string | null;
  /** HTTPS cover-art URL (600 × 600). Use directly in <img src>. null if not found. */
  coverUrl: string | null;
  /** Unix timestamp (ms) when this entry was fetched. */
  fetchedAt: number;
}

// ── In-memory session cache (no persistence) ──────────────────────────────────

const _cache = new Map<string, EnrichedData>();

/** Returns cached enriched data for a path, or null if not yet fetched. */
export function getEnriched(path: string): EnrichedData | null {
  return _cache.get(path) ?? null;
}

/** Clears all in-memory enrichment data (used on startup). */
export function clearAllEnrichments(): void {
  _cache.clear();
}

/**
 * Returns true if this track hasn't been attempted yet this session.
 * Every track is searched regardless of whether it already has an artist tag.
 */
export function needsEnrichment(path: string): boolean {
  return !_cache.has(path);
}

// ── iTunes / Deezer search (via Rust to bypass CORS) ─────────────────────────

interface MusicMetaInvokeResult {
  artist: string | null;
  album: string | null;
  coverUrl: string | null;
  source: 'itunes' | 'deezer';
}

/**
 * Cleans a raw filename / tag title into a search term.
 *
 * Steps:
 *  1. Strip file extension
 *  2. Strip leading track-number prefix  ("01 - ", "02.", "003_")
 *  3. Remove [bracket tags]              ("[Electro]", "[Monstercat Release]")
 *  4. Remove noisy parenthetical info    ("(Lyrics)", "(Official Video)", "(HD)")
 */
function buildSearchTerm(raw: string): string {
  return raw
    .replace(/\.[a-zA-Z0-9]{1,5}$/, '')                                               // 1. extension
    .replace(/^\d+[\s\-_\.]+/, '')                                                     // 2. track-number prefix
    .replace(/\[.*?\]/g, ' ')                                                          // 3. [bracket tags]
    .replace(/\((?:official|lyrics?|video|audio|hd|4k|hq|full|mv)\s*[^)]*\)/gi, ' ') // 4. noisy parens
    .replace(/\s+/g, ' ')
    .trim();
}

async function queryItunes(title: string): Promise<Omit<EnrichedData, 'fetchedAt'>> {
  const empty = { artist: null, album: null, coverUrl: null };
  if (!isTauri()) return empty;
  const clean = buildSearchTerm(title);
  if (!clean) return empty;
  try {
    const result = await invoke<MusicMetaInvokeResult | null>('search_itunes', { term: clean });
    if (!result) return empty;
    return { artist: result.artist, album: result.album, coverUrl: result.coverUrl };
  } catch {
    return empty;
  }
}

// ── Rate-limited queue ────────────────────────────────────────────────────────

const MAX_CONCURRENT = 6;
let _active = 0;
const _queue: Array<() => void> = [];

function releaseSlot(): void {
  _active--;
  if (_queue.length > 0) {
    _active++;
    _queue.shift()!();
  }
}

/**
 * Enriches one track by querying iTunes (then Deezer as fallback).
 * Resolves once done. Safe to call multiple times — subsequent calls for
 * an already-cached path resolve immediately.
 */
export function enrichTrack(path: string, title: string): Promise<void> {
  if (_cache.has(path)) return Promise.resolve();

  return new Promise<void>(resolve => {
    const run = async () => {
      try {
        const data = await queryItunes(title);
        _cache.set(path, { ...data, fetchedAt: Date.now() });
      } catch {
        _cache.set(path, { artist: null, album: null, coverUrl: null, fetchedAt: Date.now() });
      } finally {
        releaseSlot();
        resolve();
      }
    };

    if (_active < MAX_CONCURRENT) {
      _active++;
      run();
    } else {
      _queue.push(run);
    }
  });
}
