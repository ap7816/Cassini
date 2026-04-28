const CACHE_KEY = 'arctive.rawg.cache.v5';

// URLs trouvées → persistées en localStorage
const persistentCache = new Map<string, string>();
// Jeux sans résultat → mémoire seulement (retente à chaque session)
const notFoundCache = new Set<string>();

function loadCache(): Map<string, string> {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, string | null>;
    const result = new Map<string, string>();
    for (const [k, v] of Object.entries(parsed)) {
      if (v) result.set(k, v); // ignore les null sauvegardés par l'ancienne version
    }
    return result;
  } catch {
    return new Map();
  }
}

function saveCache() {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(persistentCache)));
  } catch { /* ignore */ }
}

if (typeof window !== 'undefined') {
  for (const [k, v] of loadCache()) persistentCache.set(k, v);
}

export function clearRawgCache() {
  persistentCache.clear();
  notFoundCache.clear();
  try { window.localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
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

function casingScore(title: string, result: string): number {
  // Score de 0 à 1 : proportion de caractères avec la même casse
  let matches = 0;
  const len = Math.min(title.length, result.length);
  for (let i = 0; i < len; i++) {
    if (title[i] === result[i]) matches++;
  }
  return len > 0 ? matches / len : 0;
}

function pickBestMatch(title: string, results: RawgResult[], trustFirst: boolean): string | null {
  if (!results.length) return null;
  const a = normalize(title);
  const titleIsAllCaps = isAllCaps(title);

  // Trier : déprioritiser ALL_CAPS si le titre ne l'est pas, puis par score de casse,
  // puis par longueur du nom (plus court = plus proche)
  const sorted = [...results].sort((x, y) => {
    if (!titleIsAllCaps) {
      const xCaps = x.name ? isAllCaps(x.name) : false;
      const yCaps = y.name ? isAllCaps(y.name) : false;
      if (xCaps && !yCaps) return 1;
      if (!xCaps && yCaps) return -1;
    }
    const scoreX = x.name ? casingScore(title, x.name) : 0;
    const scoreY = y.name ? casingScore(title, y.name) : 0;
    if (scoreY !== scoreX) return scoreY - scoreX;
    // À score égal, préférer le nom le plus court (ex: "Deadlock (Valve)" avant "Deadlock II: Shrine Wars")
    return (x.name?.length ?? 999) - (y.name?.length ?? 999);
  });

  // 1. Match exact sensible à la casse (ex: "Deadlock" === "Deadlock")
  const caseSensitive = sorted.find((r) => r.name === title);
  if (caseSensitive) return caseSensitive.background_image ?? null;

  // 2. Match exact normalisé — en ignorant les ALL_CAPS si le titre ne l'est pas
  // (évite de prendre "DEADLOCK" quand on cherche "Deadlock")
  const exact = sorted.find((r) => {
    if (!r.name) return false;
    if (!titleIsAllCaps && isAllCaps(r.name)) return false;
    return normalize(r.name) === a;
  });
  if (exact) return exact.background_image ?? null;

  // 3. Le nom du résultat COMMENCE par le titre cherché
  // (ex: "Deadlock (Valve)" commence par "Deadlock")
  const startsWith = sorted.find((r) => {
    if (!r.name) return false;
    if (!titleIsAllCaps && isAllCaps(r.name)) return false;
    const b = normalize(r.name);
    return b === a || b.startsWith(a + ' ');
  });
  if (startsWith) return startsWith.background_image ?? null;

  // 4. Tous les mots significatifs du titre cherché sont présents dans le résultat
  const words = a.split(' ').filter((w) => w.length > 2);
  if (words.length > 0) {
    const wordMatch = sorted.find((r) => {
      if (!r.name) return false;
      const b = normalize(r.name);
      return words.every((w) => b.includes(w));
    });
    if (wordMatch) return wordMatch.background_image ?? null;
  }

  // 5. En dernier recours, prendre le premier résultat non-ALL_CAPS
  if (trustFirst) return sorted[0].background_image ?? null;

  return null;
}

export function steamCdnUrl(appId: string): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

export function steamPortraitUrl(appId: string): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
}

export async function fetchRawgImage(title: string, apiKey: string, steamAppId?: string | null): Promise<string | null> {
  // La clé de cache inclut la plateforme pour éviter les collisions
  const cacheKey = steamAppId ? `steam:${steamAppId}` : title.toLowerCase();
  if (persistentCache.has(cacheKey)) return persistentCache.get(cacheKey)!;
  if (notFoundCache.has(cacheKey)) return null;

  // Pour les jeux Steam : CDN Steam en priorité — pas de HEAD check (bloqué par CORS)
  // Le fallback header.jpg est géré côté UI (onError dans GameCard)
  if (steamAppId) {
    const steamUrl = steamCdnUrl(steamAppId);
    console.log(`[Steam CDN] "${title}" → ${steamUrl}`);
    persistentCache.set(cacheKey, steamUrl);
    saveCache();
    return steamUrl;
  }

  if (!apiKey) return null;

  // Filtre Steam : &stores=1 si on a un appid Steam (store 1 = Steam sur RAWG)
  const storeFilter = steamAppId ? '&stores=1' : '';

  try {
    // First pass: strict exact search with original title
    const url = `https://api.rawg.io/api/games?key=${encodeURIComponent(apiKey)}&search=${encodeURIComponent(title)}&page_size=10&search_exact=true&ordering=-added${storeFilter}`;
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
      const url2 = `https://api.rawg.io/api/games?key=${encodeURIComponent(apiKey)}&search=${encodeURIComponent(title)}&page_size=5${storeFilter}`;
      const res2 = await fetch(url2);
      if (res2.ok) {
        const data2 = (await res2.json()) as { results?: RawgResult[] };
        const results2 = data2.results ?? [];
        console.log(`[RAWG] "${title}" — pass 2 (sans search_exact) → ${results2.length} résultat(s)`, results2.map((r) => r.name));
        imageUrl = pickBestMatch(title, results2, false);
        console.log(`[RAWG] "${title}" — image choisie (pass 2):`, imageUrl ?? 'aucune');
      }
    }

    // Third pass: retry with numeral conversion (3 ↔ III)
    if (imageUrl === null) {
      const altTitle = convertNumerals(title);
      if (altTitle) {
        console.log(`[RAWG] "${title}" — pass 3 (numéraux convertis: "${altTitle}")`);
        const url3 = `https://api.rawg.io/api/games?key=${encodeURIComponent(apiKey)}&search=${encodeURIComponent(altTitle)}&page_size=10&search_exact=true&ordering=-added${storeFilter}`;
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

    if (imageUrl) {
      persistentCache.set(cacheKey, imageUrl);
      saveCache();
    } else {
      notFoundCache.add(cacheKey); // pas de résultat → retente à la prochaine session
    }
    return imageUrl;
  } catch (err) {
    console.error(`[RAWG] "${title}" — erreur:`, err);
    return null;
  }
}
