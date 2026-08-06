// Récupère les métadonnées de pistes (artiste, album, couverture) via iTunes → Deezer → MusicBrainz.
// Après un résultat positif, écrit les tags directement dans le fichier audio (lofty côté Rust)
// pour ne plus jamais refaire la recherche réseau lors des prochaines sessions.
// La concurrence est limitée à MAX_CONCURRENT requêtes simultanées.

import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  readMusicEnrichedMetaRaw,
  writeMusicEnrichedMetaRaw,
} from '../../services/storage';

export interface EnrichedData {
  artist: string | null;
  album: string | null;
  // URL HTTPS vers la couverture (600×600 ou 500px), utilisable directement dans <img src>
  coverUrl: string | null;
  // Horodatage Unix (ms) du moment où cette entrée a été récupérée
  fetchedAt: number;
}

// Cache de session en mémoire — non persisté entre les redémarrages
const _cache = new Map<string, EnrichedData>();

// Ensemble des chemins dont les tags ont déjà été écrits dans le fichier lors d'une session précédente
// Chargé paresseusement (après initStorage()) pour éviter les problèmes de timing au démarrage
let _persistedEnriched: Set<string> | null = null;

function getPersistedEnriched(): Set<string> {
  if (_persistedEnriched === null) {
    const raw = readMusicEnrichedMetaRaw();
    if (!raw) {
      _persistedEnriched = new Set();
    } else {
      try {
        const arr = JSON.parse(raw);
        _persistedEnriched = Array.isArray(arr) ? new Set(arr) : new Set();
      } catch {
        _persistedEnriched = new Set();
      }
    }
  }
  return _persistedEnriched;
}

function addPersistedEnriched(path: string): void {
  const set = getPersistedEnriched();
  set.add(path);
  writeMusicEnrichedMetaRaw(JSON.stringify([...set]));
}

// Retourne les données enrichies pour un chemin, ou null si pas encore récupérées
export function getEnriched(path: string): EnrichedData | null {
  return _cache.get(path) ?? null;
}

// Efface toutes les données d'enrichissement en mémoire (utilisé au démarrage d'une nouvelle session)
export function clearAllEnrichments(): void {
  _cache.clear();
}

// Retourne true si cette piste n'a pas encore été traitée — ni en session ni persistée sur disque
export function needsEnrichment(path: string): boolean {
  return !_cache.has(path) && !getPersistedEnriched().has(path);
}

interface MusicMetaInvokeResult {
  artist: string | null;
  album: string | null;
  coverUrl: string | null;
  source: 'itunes' | 'deezer' | 'musicbrainz';
}

// Nettoie un nom de fichier brut pour en faire un terme de recherche exploitable :
// supprime l'extension, le numéro de piste, les tags [entre crochets] et les parenthèses parasites
function buildSearchTerm(raw: string): string {
  return raw
    .replace(/\.[a-zA-Z0-9]{1,5}$/, '')
    .replace(/^\d+[\s\-_.]+/, '')
    .replace(/\[.*?\]/g, ' ')
    .replace(/\((?:official|lyrics?|video|audio|hd|4k|hq|full|mv)\s*[^)]*\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Interroge l'API via Rust (pour contourner les restrictions CORS du navigateur)
async function queryMusicApi(title: string): Promise<Omit<EnrichedData, 'fetchedAt'>> {
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

// Écrit les tags trouvés directement dans le fichier audio (fire-and-forget, non bloquant)
// En cas d'échec : pas de marquage persistant → nouvelle tentative à la prochaine session
function writeTagsToFile(
  path: string,
  data: Omit<EnrichedData, 'fetchedAt'>,
): void {
  if (!isTauri()) return;
  if (!data.artist && !data.album && !data.coverUrl) return;

  invoke('write_audio_tags', {
    path,
    artist: data.artist ?? null,
    album: data.album ?? null,
    coverUrl: data.coverUrl ?? null,
  })
    .then(() => {
      addPersistedEnriched(path);
    })
    .catch((e: unknown) => {
      console.warn('[enrichMeta] write_audio_tags échec (non bloquant):', e);
    });
}

// Limite le nombre de requêtes simultanées à 6 pour ne pas saturer le thread pool Rust
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

// Supprime la pochette enrichie en mémoire (URL potentiellement erronée) et marque la piste
// comme persistée — utilisé après un changement manuel d'illustration pour éviter la ré-enrichissement
export function resetEnrichment(path: string): void {
  _cache.delete(path);
  addPersistedEnriched(path);
}

// Enrichit une piste via iTunes → Deezer → MusicBrainz (côté Rust)
// Si des données sont trouvées, elles sont écrites dans le fichier pour les sessions futures
export function enrichTrack(path: string, title: string): Promise<void> {
  if (_cache.has(path) || getPersistedEnriched().has(path)) return Promise.resolve();

  return new Promise<void>(resolve => {
    const run = async () => {
      try {
        const data = await queryMusicApi(title);
        _cache.set(path, { ...data, fetchedAt: Date.now() });
        // Écrit les tags dans le fichier en arrière-plan si on a trouvé quelque chose d'utile
        if (data.artist || data.album || data.coverUrl) {
          writeTagsToFile(path, data);
        }
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
