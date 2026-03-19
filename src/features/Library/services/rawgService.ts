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

type RawgResult = { name?: string; background_image?: string | null };

function pickBestMatch(title: string, results: RawgResult[], trustFirst: boolean): string | null {
  if (!results.length) return null;
  const a = normalize(title);

  // 1. Exact normalized match
  const exact = results.find((r) => r.name && normalize(r.name) === a);
  if (exact) return exact.background_image ?? null;

  // 2. All significant words of the searched title are present in the found title
  const words = a.split(' ').filter((w) => w.length > 2);
  if (words.length > 0) {
    const wordMatch = results.find((r) => {
      if (!r.name) return false;
      const b = normalize(r.name);
      return words.every((w) => b.includes(w));
    });
    if (wordMatch) return wordMatch.background_image ?? null;
  }

  // 3. RAWG already filtered by search_exact — trust its first result
  if (trustFirst) return results[0].background_image ?? null;

  return null;
}

export async function fetchRawgImage(title: string, apiKey: string): Promise<string | null> {
  if (!apiKey) return null;

  const cacheKey = title.toLowerCase();
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey) ?? null;

  try {
    // First pass: strict exact search
    const url = `https://api.rawg.io/api/games?key=${encodeURIComponent(apiKey)}&search=${encodeURIComponent(title)}&page_size=10&search_exact=true&ordering=-added`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[RAWG] "${title}" → HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as { results?: RawgResult[] };
    const results = data.results ?? [];

    console.log(`[RAWG] "${title}" — pass 1 (search_exact) → ${results.length} résultat(s)`, results.map((r) => r.name));

    let imageUrl = pickBestMatch(title, results, results.length > 0);
    console.log(`[RAWG] "${title}" — image choisie (pass 1):`, imageUrl ?? 'aucune');

    // Second pass: if exact search returned nothing, retry without search_exact
    if (imageUrl === null && results.length === 0) {
      const url2 = `https://api.rawg.io/api/games?key=${encodeURIComponent(apiKey)}&search=${encodeURIComponent(title)}&page_size=5`;
      const res2 = await fetch(url2);
      if (res2.ok) {
        const data2 = (await res2.json()) as { results?: RawgResult[] };
        const results2 = data2.results ?? [];
        console.log(`[RAWG] "${title}" — pass 2 (sans search_exact) → ${results2.length} résultat(s)`, results2.map((r) => r.name));
        imageUrl = pickBestMatch(title, results2, false);
        console.log(`[RAWG] "${title}" — image choisie (pass 2):`, imageUrl ?? 'aucune');
      }
    }

    memoryCache.set(cacheKey, imageUrl);
    saveCache(memoryCache);
    return imageUrl;
  } catch (err) {
    console.error(`[RAWG] "${title}" — erreur:`, err);
    return null;
  }
}
