import { useState, useEffect } from 'react';
import type { RefObject } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface TrackMeta {
  path: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  durationSecs: number | null;
  coverDataUrl: string | null;
  coverLoaded: boolean;
}

// Cache de session limité à 2000 entrées avec éviction FIFO pour éviter les fuites mémoire
const MAX_CACHE = 2000;
const _cache = new Map<string, TrackMeta>();

// Supprime les entrées les plus anciennes du cache quand la limite est atteinte
function evict() {
  while (_cache.size >= MAX_CACHE) {
    const oldest = _cache.keys().next().value;
    if (oldest === undefined) break;
    _cache.delete(oldest);
  }
}

// Limite la concurrence des appels Rust pour l'extraction des couvertures à 4 simultanés
const MAX_COVER_CONCURRENT = 4;
let _coverActive = 0;
const _coverQueue: Array<() => void> = [];

// Libère un slot de concurrence et démarre la prochaine tâche en attente si la queue n'est pas vide
function releaseCoverSlot() {
  _coverActive--;
  if (_coverQueue.length > 0) {
    _coverActive++;
    _coverQueue.shift()!();
  }
}

// Enfile une fonction async pour respecter la limite de concurrence des appels cover art
function runWithCoverLimit<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => fn().then(resolve, reject).finally(releaseCoverSlot);
    if (_coverActive < MAX_COVER_CONCURRENT) {
      _coverActive++;
      run();
    } else {
      _coverQueue.push(run);
    }
  });
}

// Charge titre/artiste/album/durée pour un lot de pistes en un seul appel Rust parallèle (rayon)
// Les couvertures ne sont pas incluses pour garder cet appel rapide
async function fetchBasicBatch(paths: string[]): Promise<void> {
  if (!paths.length) return;
  try {
    const results = await invoke<TrackMeta[]>('get_tracks_basic_batch', { paths });
    for (const meta of results) {
      if (_cache.has(meta.path)) continue;
      evict();
      _cache.set(meta.path, { ...meta, coverDataUrl: null, coverLoaded: false });
    }
  } catch {
    // Stocke des entrées vides pour ne pas retenter sur chaque rendu
    for (const path of paths) {
      if (!_cache.has(path)) {
        evict();
        _cache.set(path, {
          path, title: null, artist: null, album: null,
          durationSecs: null, coverDataUrl: null, coverLoaded: false,
        });
      }
    }
  }
}

// Récupère la couverture d'une seule piste via Rust, avec limitation de la concurrence
async function fetchCover(path: string): Promise<string | null> {
  const existing = _cache.get(path);
  if (existing?.coverLoaded) return existing.coverDataUrl;
  return runWithCoverLimit(async () => {
    try {
      const meta = await invoke<TrackMeta>('get_track_metadata', { path });
      const coverDataUrl = meta.coverDataUrl ?? null;
      const entry = _cache.get(path);
      if (entry) {
        entry.coverDataUrl = coverDataUrl;
        entry.coverLoaded = true;
      } else {
        evict();
        _cache.set(path, { ...meta, coverDataUrl, coverLoaded: true });
      }
      return coverDataUrl;
    } catch {
      const entry = _cache.get(path);
      if (entry) { entry.coverLoaded = true; entry.coverDataUrl = null; }
      return null;
    }
  });
}

// Listeners notifiés quand une pochette est rafraîchie manuellement (ex: après "Changer l'illustration")
const _coverListeners = new Map<string, Set<(url: string | null) => void>>();

// Abonne un callback aux mises à jour de pochette pour un chemin donné — retourne la désinscription
function subscribeCoverRefresh(path: string, fn: (url: string | null) => void): () => void {
  if (!_coverListeners.has(path)) _coverListeners.set(path, new Set());
  _coverListeners.get(path)!.add(fn);
  return () => _coverListeners.get(path)?.delete(fn);
}

// Force le rechargement de la pochette d'une piste depuis le fichier et notifie les composants abonnés
export async function refreshCover(path: string): Promise<void> {
  const entry = _cache.get(path);
  if (entry) { entry.coverLoaded = false; entry.coverDataUrl = null; }
  const dataUrl = await fetchCover(path);
  _coverListeners.get(path)?.forEach(fn => fn(dataUrl));
}

// Charge titre/artiste/album/durée pour toutes les pistes en un seul appel Rust parallèle
// Retourne un getter synchrone (depuis le cache) et un indicateur de chargement
export function useBasicBatch(paths: string[]): {
  getMeta: (path: string) => TrackMeta | null;
  loading: boolean;
} {
  const [loading, setLoading] = useState(false);
  const [, bump] = useState(0);
  const key = paths.join('\x00');

  // Ne lance le fetch que pour les pistes absentes du cache
  useEffect(() => {
    const missing = paths.filter(p => !_cache.has(p));
    if (!missing.length) return;
    setLoading(true);
    fetchBasicBatch(missing).then(() => {
      setLoading(false);
      bump(n => n + 1);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    getMeta: (path: string) => _cache.get(path) ?? null,
    loading,
  };
}

// Charge la couverture d'une piste de façon paresseuse : déclenche le fetch Rust seulement
// quand l'élément référencé entre dans la zone de visibilité (IntersectionObserver à 200 px)
export function useLazyCoverArt(
  path: string | null,
  ref: RefObject<HTMLElement | null>,
): string | null {
  const [cover, setCover] = useState<string | null>(() => {
    if (!path) return null;
    const e = _cache.get(path);
    return e?.coverLoaded ? (e.coverDataUrl ?? null) : null;
  });

  useEffect(() => {
    if (!path) { setCover(null); return; }
    const entry = _cache.get(path);
    if (entry?.coverLoaded) { setCover(entry.coverDataUrl ?? null); return; }
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        observer.disconnect();
        fetchCover(path).then(setCover);
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // ref est stable pendant toute la durée de vie du composant — omis intentionnellement des deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  // Écoute les refreshes manuels de pochette (ex: "Changer l'illustration")
  useEffect(() => {
    if (!path) return;
    return subscribeCoverRefresh(path, setCover);
  }, [path]);

  return cover;
}

// Charge toutes les métadonnées d'une seule piste (incluant la couverture) immédiatement
// Utilisé par le mini-player qui doit afficher la couverture de la piste courante sans délai
export function useSingleMeta(path: string | null): TrackMeta | null {
  // Le résultat asynchrone est étiqueté par le chemin qui l'a produit : sans
  // ça, changer de piste afficherait brièvement la pochette de la précédente.
  const [fetched, setFetched] = useState<{ path: string; meta: TrackMeta | null } | null>(null);

  useEffect(() => {
    if (!path) return;
    // Déjà complet en cache : la valeur de repli ci-dessous suffit, inutile
    // d'écrire l'état — le faire ici provoquait un rendu en cascade.
    if (_cache.get(path)?.coverLoaded) return;

    let cancelled = false;
    fetchCover(path).then(() => {
      if (!cancelled) setFetched({ path, meta: _cache.get(path) ?? null });
    });
    return () => { cancelled = true; };
  }, [path]);

  if (!path) return null;
  if (fetched && fetched.path === path) return fetched.meta;
  return _cache.get(path) ?? null;
}
