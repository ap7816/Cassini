import { readRawgCacheRaw, writeRawgCacheRaw, removeRawgCache as storageRemoveRawgCache } from '../../../services/storage';

// URLs d'images trouvées → persistées dans le stockage entre les sessions
const persistentCache = new Map<string, string>();
// Clés sans résultat → gardées en mémoire seulement (retente à chaque redémarrage)
const notFoundCache = new Set<string>();

// Charge le cache d'images RAWG depuis le stockage au démarrage
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

// Persiste le cache courant dans le stockage (après chaque nouvelle entrée)
function saveCache() {
  writeRawgCacheRaw(JSON.stringify(Object.fromEntries(persistentCache)));
}

// Pré-charge le cache persistant dès l'import du module (côté client uniquement)
if (typeof window !== 'undefined') {
  for (const [k, v] of loadCache()) persistentCache.set(k, v);
}

// Vide complètement le cache RAWG en mémoire et dans le stockage
export function clearRawgCache() {
  persistentCache.clear();
  notFoundCache.clear();
  storageRemoveRawgCache();
}

// Supprime une seule entrée du cache (par ex. pour forcer une nouvelle tentative après une erreur d'image)
export function clearRawgCacheEntry(key: string) {
  persistentCache.delete(key);
  notFoundCache.delete(key);
  saveCache();
}

// Ajoute ou retire une entrée du cache selon que l'URL est trouvée ou non
export function setRawgCacheEntry(key: string, value: string | null) {
  if (value) {
    persistentCache.set(key, value);
    saveCache();
  } else {
    notFoundCache.add(key);
  }
}

// Normalise un titre pour la comparaison : minuscules, sans ponctuation, espaces simples
function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
}

// Tables de conversion chiffres arabes ↔ chiffres romains (1–11)
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

// Convertit les numéraux dans un titre (3↔III) pour une seconde tentative de recherche
function convertNumerals(title: string): string | null {
  const withRoman = title.replace(/\b(\d+)\b/g, (_, n) => {
    const num = parseInt(n, 10);
    const pair = ARABIC_TO_ROMAN.find(([v]) => v === num);
    return pair ? pair[1] : n;
  });
  if (withRoman !== title) return withRoman;

  let withArabic = title;
  for (const [regex, arabic] of ROMAN_TO_ARABIC) {
    withArabic = withArabic.replace(regex, arabic);
  }
  if (withArabic !== title) return withArabic;

  return null;
}

type RawgResult = { name?: string; background_image?: string | null };

// Vérifie si une chaîne est entièrement en majuscules (ex: "DEADLOCK")
function isAllCaps(s: string): boolean {
  return s === s.toUpperCase() && s !== s.toLowerCase();
}

// Calcule un score de 0 à 1 basé sur la proportion de caractères identiques entre titre cherché et résultat
function casingScore(title: string, result: string): number {
  let matches = 0;
  const len = Math.min(title.length, result.length);
  for (let i = 0; i < len; i++) {
    if (title[i] === result[i]) matches++;
  }
  return len > 0 ? matches / len : 0;
}

// Choisit le meilleur résultat RAWG parmi plusieurs candidats en 5 passes de précision décroissante
function pickBestMatch(title: string, results: RawgResult[], trustFirst: boolean): string | null {
  if (!results.length) return null;
  const a = normalize(title);
  const titleIsAllCaps = isAllCaps(title);

  // Trie : déprioritise les ALL_CAPS si le titre ne l'est pas, puis par score de casse, puis par longueur
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
    // À score égal, préférer le nom le plus court (ex: "Deadlock" avant "Deadlock II: Shrine Wars")
    return (x.name?.length ?? 999) - (y.name?.length ?? 999);
  });

  // Passe 1 : correspondance exacte sensible à la casse
  const caseSensitive = sorted.find((r) => r.name === title);
  if (caseSensitive) return caseSensitive.background_image ?? null;

  // Passe 2 : correspondance exacte normalisée, en ignorant les résultats ALL_CAPS non pertinents
  const exact = sorted.find((r) => {
    if (!r.name) return false;
    if (!titleIsAllCaps && isAllCaps(r.name)) return false;
    return normalize(r.name) === a;
  });
  if (exact) return exact.background_image ?? null;

  // Passe 3 : le nom du résultat commence par le titre cherché (ex: "Deadlock (Valve)")
  const startsWith = sorted.find((r) => {
    if (!r.name) return false;
    if (!titleIsAllCaps && isAllCaps(r.name)) return false;
    const b = normalize(r.name);
    return b === a || b.startsWith(a + ' ');
  });
  if (startsWith) return startsWith.background_image ?? null;

  // Passe 4 : tous les mots significatifs du titre (>2 chars) sont présents dans le résultat
  const words = a.split(' ').filter((w) => w.length > 2);
  if (words.length > 0) {
    const wordMatch = sorted.find((r) => {
      if (!r.name) return false;
      const b = normalize(r.name);
      return words.every((w) => b.includes(w));
    });
    if (wordMatch) return wordMatch.background_image ?? null;
  }

  // Passe 5 : en dernier recours, prendre le premier résultat non-ALL_CAPS
  if (trustFirst) return sorted[0].background_image ?? null;

  return null;
}

// Génère l'URL de la bannière header.jpg Steam (1920×620) depuis un AppID
export function steamCdnUrl(appId: string): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

// Génère l'URL de la jaquette portrait Steam (600×900) utilisée en fallback si header.jpg échoue
export function steamPortraitUrl(appId: string): string {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
}

// Récupère l'URL d'une image de jeu : CDN Steam direct pour les jeux Steam, RAWG API pour les autres
// Utilise un double cache (mémoire + localStorage) pour éviter les requêtes répétées
// Effectue jusqu'à 3 passes de recherche RAWG avec des stratégies de correspondance différentes
export async function fetchRawgImage(title: string, apiKey: string, steamAppId?: string | null): Promise<string | null> {
  // La clé de cache inclut la plateforme pour éviter les collisions entre jeux homonymes
  const cacheKey = steamAppId ? `steam:${steamAppId}` : title.toLowerCase();
  if (persistentCache.has(cacheKey)) return persistentCache.get(cacheKey)!;
  if (notFoundCache.has(cacheKey)) return null;

  // Pour les jeux Steam, on utilise directement le CDN sans vérification HEAD (bloqué par CORS)
  if (steamAppId) {
    const steamUrl = steamCdnUrl(steamAppId);
    console.log(`[Steam CDN] "${title}" → ${steamUrl}`);
    persistentCache.set(cacheKey, steamUrl);
    saveCache();
    return steamUrl;
  }

  if (!apiKey) return null;

  const storeFilter = steamAppId ? '&stores=1' : '';

  try {
    // Passe 1 : recherche exacte avec le titre original
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

    // Passe 2 : si la recherche exacte n'a rien retourné, retente sans search_exact
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

    // Passe 3 : si toujours sans résultat, retente avec les numéraux convertis (3 ↔ III)
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
      // Pas de résultat cette session → mémorisé pour éviter les requêtes inutiles, retente au redémarrage
      notFoundCache.add(cacheKey);
    }
    return imageUrl;
  } catch (err) {
    console.error(`[RAWG] "${title}" — erreur:`, err);
    return null;
  }
}
