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

const ARABIC_TO_ROMAN: [number, string][] = [
  [10, 'X'], [9, 'IX'], [8, 'VIII'], [7, 'VII'], [6, 'VI'],
  [5, 'V'], [4, 'IV'], [3, 'III'], [2, 'II'], [1, 'I'],
];
const ROMAN_TO_ARABIC: [RegExp, string][] = [
  [/\bXI\b/gi, '11'], [/\bX\b/gi, '10'], [/\bIX\b/gi, '9'],
  [/\bVIII\b/gi, '8'], [/\bVII\b/gi, '7'], [/\bVI\b/gi, '6'],
  [/\bV\b/gi, '5'], [/\bIV\b/gi, '4'], [/\bIII\b/gi, '3'],
  [/\bII\b/gi, '2'], [/\bI\b/gi, '1'],
];

function convertNumerals(title: string): string | null {
  // Arabic → Roman
  const withRoman = title.replace(/\b(\d+)\b/g, (_, n) => {
    const num = parseInt(n, 10);
    const pair = ARABIC_TO_ROMAN.find(([v]) => v === num);
    return pair ? pair[1] : n;
  });
  if (withRoman !== title) return withRoman;

  // Roman → Arabic
  let withArabic = title;
  for (const [regex, arabic] of ROMAN_TO_ARABIC) {
    withArabic = withArabic.replace(regex, arabic);
  }
  if (withArabic !== title) return withArabic;

  return null;
}

type RawgResult = { name?: string; background_image?: string | null };

function isAllCaps(s: string): boolean {
  return s === s.toUpperCase() && s !== s.toLowerCase();
}

function pickBestMatch(title: string, results: RawgResult[], trustFirst: boolean): string | null {
  if (!results.length) return null;
  const a = normalize(title);

  // Déprioritiser les noms ALL_CAPS (ex: "FORTNITE" après "Fortnite")
  const sorted = [...results].sort((x, y) => {
    const xCaps = x.name ? isAllCaps(x.name) : false;
    const yCaps = y.name ? isAllCaps(y.name) : false;
    if (xCaps && !yCaps) return 1;
    if (!xCaps && yCaps) return -1;
    return 0;
  });

  // 1. Exact normalized match
  const exact = sorted.find((r) => r.name && normalize(r.name) === a);
  if (exact) return exact.background_image ?? null;

  // 2. All significant words of the searched title are present in the found title
  const words = a.split(' ').filter((w) => w.length > 2);
  if (words.length > 0) {
    const wordMatch = sorted.find((r) => {
      if (!r.name) return false;
      const b = normalize(r.name);
      return words.every((w) => b.includes(w));
    });
    if (wordMatch) return wordMatch.background_image ?? null;
  }

  // 3. RAWG already filtered by search_exact — trust its first non-all-caps result
  if (trustFirst) return sorted[0].background_image ?? null;

  return null;
}

function toTitleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function fetchRawgImage(title: string, apiKey: string): Promise<string | null> {
  if (!apiKey) return null;

  // Normalise la casse pour RAWG (ex: "DEADLOCK" → "Deadlock")
  const searchTitle = toTitleCase(title);
  const cacheKey = title.toLowerCase();
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey) ?? null;

  try {
    // First pass: strict exact search
    const url = `https://api.rawg.io/api/games?key=${encodeURIComponent(apiKey)}&search=${encodeURIComponent(searchTitle)}&page_size=10&search_exact=true&ordering=-added`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[RAWG] "${searchTitle}" → HTTP ${res.status}`);
      return null;
    }

    const data = (await res.json()) as { results?: RawgResult[] };
    const results = data.results ?? [];

    console.log(`[RAWG] "${searchTitle}" — pass 1 (search_exact) → ${results.length} résultat(s)`, results.map((r) => r.name));

    let imageUrl = pickBestMatch(searchTitle, results, results.length > 0);
    console.log(`[RAWG] "${searchTitle}" — image choisie (pass 1):`, imageUrl ?? 'aucune');

    // Second pass: if exact search returned nothing, retry without search_exact
    if (imageUrl === null && results.length === 0) {
      const url2 = `https://api.rawg.io/api/games?key=${encodeURIComponent(apiKey)}&search=${encodeURIComponent(searchTitle)}&page_size=5`;
      const res2 = await fetch(url2);
      if (res2.ok) {
        const data2 = (await res2.json()) as { results?: RawgResult[] };
        const results2 = data2.results ?? [];
        console.log(`[RAWG] "${searchTitle}" — pass 2 (sans search_exact) → ${results2.length} résultat(s)`, results2.map((r) => r.name));
        imageUrl = pickBestMatch(searchTitle, results2, false);
        console.log(`[RAWG] "${searchTitle}" — image choisie (pass 2):`, imageUrl ?? 'aucune');
      }
    }

    // Third pass: retry with numeral conversion (3 ↔ III)
    if (imageUrl === null) {
      const altTitle = convertNumerals(searchTitle);
      if (altTitle) {
        console.log(`[RAWG] "${title}" — pass 3 (numéraux convertis: "${altTitle}")`);
        const url3 = `https://api.rawg.io/api/games?key=${encodeURIComponent(apiKey)}&search=${encodeURIComponent(altTitle)}&page_size=10&search_exact=true&ordering=-added`;
        const res3 = await fetch(url3);
        if (res3.ok) {
          const data3 = (await res3.json()) as { results?: RawgResult[] };
          const results3 = data3.results ?? [];
          console.log(`[RAWG] "${altTitle}" — pass 3 → ${results3.length} résultat(s)`, results3.map((r) => r.name));
          imageUrl = pickBestMatch(altTitle, results3, results3.length > 0);
          console.log(`[RAWG] "${altTitle}" — image choisie (pass 3):`, imageUrl ?? 'aucune');
        }
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
