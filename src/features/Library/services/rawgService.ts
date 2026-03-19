const CACHE_KEY = 'arctive.rawg.cache.v2';

// Cache en mémoire pour la session courante
const memoryCache = new Map<string, string | null>();

function loadCache(): Map<string, string | null> {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, string | null>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

function saveCache(cache: Map<string, string | null>) {
  try {
    const obj = Object.fromEntries(cache);
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
  } catch {
    // localStorage plein — on ignore
  }
}

// Charge le cache persistant au démarrage
if (typeof window !== 'undefined') {
  for (const [k, v] of loadCache()) {
    memoryCache.set(k, v);
  }
}

/**
 * Récupère l'URL de cover d'un jeu via RAWG.
 * Retourne null si introuvable ou si pas de clé API.
 * Met en cache le résultat dans localStorage.
 */
export async function fetchRawgImage(title: string, apiKey: string): Promise<string | null> {
  if (!apiKey) return null;

  const cacheKey = `${title.toLowerCase()}`;

  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey) ?? null;
  }

  try {
    const url = `https://api.rawg.io/api/games?key=${encodeURIComponent(apiKey)}&search=${encodeURIComponent(title)}&page_size=1`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as { results?: { background_image?: string | null }[] };
    const imageUrl = data.results?.[0]?.background_image ?? null;

    memoryCache.set(cacheKey, imageUrl);
    saveCache(memoryCache);

    return imageUrl;
  } catch {
    return null;
  }
}
