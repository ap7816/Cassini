// Récupère les métadonnées de pistes (artiste, album, couverture) depuis iTunes puis Deezer en fallback.
// Toutes les pistes sont tentées à chaque démarrage sans filtre sur le tag artiste.
// Les résultats sont conservés uniquement en mémoire pour la session — rien n'est écrit sur disque.
// La concurrence est limitée à MAX_CONCURRENT requêtes simultanées.

import { invoke, isTauri } from '@tauri-apps/api/core';

export interface EnrichedData {
  artist: string | null;
  album: string | null;
  // URL HTTPS vers la couverture (600×600), utilisable directement dans <img src>
  coverUrl: string | null;
  // Horodatage Unix (ms) du moment où cette entrée a été récupérée
  fetchedAt: number;
}

// Cache de session en mémoire — non persisté entre les redémarrages
const _cache = new Map<string, EnrichedData>();

// Retourne les données enrichies pour un chemin, ou null si pas encore récupérées
export function getEnriched(path: string): EnrichedData | null {
  return _cache.get(path) ?? null;
}

// Efface toutes les données d'enrichissement (utilisé au démarrage d'une nouvelle session)
export function clearAllEnrichments(): void {
  _cache.clear();
}

// Retourne true si cette piste n'a pas encore été tentée pendant la session courante
export function needsEnrichment(path: string): boolean {
  return !_cache.has(path);
}

interface MusicMetaInvokeResult {
  artist: string | null;
  album: string | null;
  coverUrl: string | null;
  source: 'itunes' | 'deezer';
}

// Nettoie un nom de fichier brut pour en faire un terme de recherche exploitable :
// supprime l'extension, le numéro de piste, les tags [entre crochets] et les parenthèses parasites
function buildSearchTerm(raw: string): string {
  return raw
    .replace(/\.[a-zA-Z0-9]{1,5}$/, '')
    .replace(/^\d+[\s\-_\.]+/, '')
    .replace(/\[.*?\]/g, ' ')
    .replace(/\((?:official|lyrics?|video|audio|hd|4k|hq|full|mv)\s*[^)]*\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Interroge l'API iTunes via Rust (pour contourner les restrictions CORS du navigateur)
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

// Limite le nombre de requêtes iTunes/Deezer simultanées à 6 pour ne pas saturer le thread pool Rust
const MAX_CONCURRENT = 6;
let _active = 0;
const _queue: Array<() => void> = [];

// Libère un slot de concurrence et démarre la prochaine tâche en attente
function releaseSlot(): void {
  _active--;
  if (_queue.length > 0) {
    _active++;
    _queue.shift()!();
  }
}

// Enrichit une piste en interrogeant iTunes (puis Deezer en fallback côté Rust)
// Les appels suivants pour un chemin déjà en cache se résolvent immédiatement
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
