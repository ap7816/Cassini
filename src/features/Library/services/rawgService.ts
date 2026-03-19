const CACHE_KEY = 'arctive.rawg.cache.v2';

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
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(cache)));
  } catch { /* ignore */ }
}

if (typeof window !== 'undefined') {
  for (const [k, v] of loadCache()) memoryCache.set(k, v);
}

export function clearRawgCache() {
  memoryCache.clear();
  try { window.localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
}

function isTitleMatch(searched: string, found: string): boolean {
  const a = normalize(searched);
  const b = normalize(found);
  return a === b || b.startsWith(a) || a.startsWith(b);
}

export async function fetchRawgImage(title: string, apiKey: string): Promise<string | null> {
  if (!apiKey) return null;

  const cacheKey = title.toLowerCase();
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey) ?? null;

  try {
    const url = `https://api.rawg.io/api/games?key=${encodeURIComponent(apiKey)}&search=${encodeURIComponent(title)}&page_size=5&search_exact=true`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = (await res.json()) as {
      results?: { name?: string; background_image?: string | null }[];
    };

    const match = data.results?.find(
      (r) => r.name && isTitleMatch(title, r.name),
    );
    const imageUrl = match?.background_image ?? null;

    memoryCache.set(cacheKey, imageUrl);
    saveCache(memoryCache);

    return imageUrl;
  } catch {
    return null;
  }
}
