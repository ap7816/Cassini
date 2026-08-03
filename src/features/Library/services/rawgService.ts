import { readRawgCacheRaw, writeRawgCacheRaw, removeRawgCache as storageRemoveCache } from '../../../services/storage';

type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const tauri = window.__TAURI__ as unknown as { invoke?: TauriInvoke } | undefined;
  if (tauri?.invoke) return tauri.invoke<T>(cmd, args);
  const mod = await import('@tauri-apps/api/core');
  return (mod.invoke as unknown as TauriInvoke)<T>(cmd, args);
}

// URLs d'images trouvées → persistées dans le stockage entre les sessions
const persistentCache = new Map<string, string>();
// Clés sans résultat → gardées en mémoire seulement (retente à chaque redémarrage)
const notFoundCache = new Set<string>();

function loadCache(): Map<string, string> {
  try {
    const raw = readRawgCacheRaw();
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, string | null>;
    const result = new Map<string, string>();
    for (const [k, v] of Object.entries(parsed)) {
      if (v) result.set(k, v);
    }
    return result;
  } catch {
    return new Map();
  }
}

function saveCache() {
  writeRawgCacheRaw(JSON.stringify(Object.fromEntries(persistentCache)));
}

if (typeof window !== 'undefined') {
  for (const [k, v] of loadCache()) persistentCache.set(k, v);
}

export function clearRawgCache() {
  persistentCache.clear();
  notFoundCache.clear();
  storageRemoveCache();
}

export function clearRawgCacheEntry(key: string) {
  persistentCache.delete(key);
  notFoundCache.delete(key);
  saveCache();
}

export function setRawgCacheEntry(key: string, value: string | null) {
  if (value) {
    persistentCache.set(key, value);
    saveCache();
  } else {
    notFoundCache.add(key);
  }
}

// Génère l'URL de la bannière header.jpg Steam (460×215) depuis un AppID
export function steamCdnUrl(appId: string): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

// Génère l'URL portrait Steam (600×900) utilisée en fallback si header.jpg échoue
export function steamPortraitUrl(appId: string): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
}

// Récupère l'URL de couverture d'un jeu :
// - Jeux Steam → CDN Valve directement (pas d'appel API)
// - Autres → commande Tauri fetch_sgdb_image (Rust, pas de CORS)
// Cache persistant (localStorage) + cache mémoire en session
export async function fetchRawgImage(title: string, apiKey: string, steamAppId?: string | null): Promise<string | null> {
  const cacheKey = steamAppId ? `steam:${steamAppId}` : title.toLowerCase();
  if (persistentCache.has(cacheKey)) return persistentCache.get(cacheKey)!;
  if (notFoundCache.has(cacheKey)) return null;

  if (steamAppId) {
    const steamUrl = steamCdnUrl(steamAppId);
    persistentCache.set(cacheKey, steamUrl);
    saveCache();
    return steamUrl;
  }

  if (!apiKey) { console.log('[sgdb] no api key, skipping', title); return null; }

  console.log('[sgdb] calling tauri for', title);
  try {
    const url = await tauriInvoke<string | null>('fetch_sgdb_image', { title, apiKey });
    console.log('[sgdb] result for', title, '→', url);
    if (url) {
      persistentCache.set(cacheKey, url);
      saveCache();
      return url;
    }
  } catch (e) {
    console.error('[sgdb] tauri invoke error for', title, e);
  }

  notFoundCache.add(cacheKey);
  return null;
}
