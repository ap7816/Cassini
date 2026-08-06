export type LauncherIconInput = {
  id: string;
  iconPath?: string | null;
};

type IconCacheEntry = { dataUrl: string; updatedAt: number };
type IconCache = Record<string, IconCacheEntry>;

import { readLauncherIconsRaw, writeLauncherIconsRaw } from '../../../services/storage';

// Durée de vie du cache : 30 jours — au-delà, les icônes sont re-extraites depuis le .exe
const ICON_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Lit le cache d'icônes depuis le stockage persistant
function readCache(): IconCache {
  try {
    const raw = readLauncherIconsRaw();
    if (!raw) return {};
    const parsed = JSON.parse(raw) as IconCache;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// Écrit le cache d'icônes dans le stockage persistant
function writeCache(cache: IconCache): void {
  writeLauncherIconsRaw(JSON.stringify(cache));
}

// Supprime les entrées expirées (TTL dépassé) ou malformées du cache
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

// Purge le cache (TTL) et le réécrit sur le disque — appelé au démarrage de la page Launchers
export function pruneLauncherIconCache(): void {
  const cache = pruneCache(readCache());
  writeCache(cache);
}

// Sépare les icônes déjà disponibles en cache de celles qui doivent être extraites via Rust
export function getCachedLauncherIconsById(inputs: LauncherIconInput[]): {
  byId: Record<string, string>;
  missing: Array<{ id: string; iconPath: string }>;
} {
  const cache = pruneCache(readCache());
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

// Enregistre ou rafraîchit l'icône d'un launcher identifié par son iconPath
export function storeLauncherIcon(iconPath: string, dataUrl: string): void {
  let cache = pruneCache(readCache());
  cache[iconPath] = { dataUrl, updatedAt: Date.now() };
  cache = pruneCache(cache);
  writeCache(cache);
}

// Enregistre un lot d'icônes en une seule écriture pour minimiser les accès au stockage
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
