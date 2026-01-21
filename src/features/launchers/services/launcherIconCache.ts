export type LauncherIconInput = {
  id: string;
  iconPath?: string | null;
};

type IconCacheEntry = { dataUrl: string; updatedAt: number };
type IconCache = Record<string, IconCacheEntry>; // key = iconPath

const ICON_CACHE_KEY = 'arctive.launcherIcons.v1';
const ICON_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function readCache(): IconCache {
  if (!canUseStorage()) return {};
  try {
    const raw = window.localStorage.getItem(ICON_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as IconCache;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeCache(cache: IconCache): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(ICON_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore (quota/disabled)
  }
}

function pruneCache(cache: IconCache): IconCache {
  const now = Date.now();
  const next: IconCache = {};
  for (const [k, v] of Object.entries(cache)) {
    if (!v || typeof v !== 'object') continue;
    if (typeof v.dataUrl !== 'string') continue;
    if (typeof v.updatedAt !== 'number') continue;
    if (now - v.updatedAt > ICON_CACHE_TTL_MS) continue;
    next[k] = v;
  }
  return next;
}

/** Nettoie le cache (TTL) et le réécrit. */
export function pruneLauncherIconCache(): void {
  const cache = pruneCache(readCache());
  writeCache(cache);
}

/**
 * Retourne :
 * - byId : icônes trouvées en cache, indexées par launcher id
 * - missing : celles à fetch via Rust (id + iconPath)
 */
export function getCachedLauncherIconsById(inputs: LauncherIconInput[]): {
  byId: Record<string, string>;
  missing: Array<{ id: string; iconPath: string }>;
} {
  let cache = pruneCache(readCache());
  writeCache(cache);

  const byId: Record<string, string> = {};
  const missing: Array<{ id: string; iconPath: string }> = [];

  for (const item of inputs) {
    const iconPath = item.iconPath ?? null;
    if (!iconPath) continue;

    const hit = cache[iconPath];
    if (hit?.dataUrl) byId[item.id] = hit.dataUrl;
    else missing.push({ id: item.id, iconPath });
  }

  return { byId, missing };
}

/** Stocke/refresh une icône pour un iconPath donné. */
export function storeLauncherIcon(iconPath: string, dataUrl: string): void {
  let cache = pruneCache(readCache());
  cache[iconPath] = { dataUrl, updatedAt: Date.now() };
  cache = pruneCache(cache);
  writeCache(cache);
}

/** Stocke plusieurs icônes d’un coup (plus efficace). */
export function storeLauncherIcons(batch: Array<{ iconPath: string; dataUrl: string }>): void {
  let cache = pruneCache(readCache());
  const now = Date.now();

  for (const item of batch) {
    if (!item.iconPath || !item.dataUrl) continue;
    cache[item.iconPath] = { dataUrl: item.dataUrl, updatedAt: now };
  }

  cache = pruneCache(cache);
  writeCache(cache);
}
