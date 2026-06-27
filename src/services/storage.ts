// Point d'entrée unique pour toutes les opérations de persistance.
// Backend : tauri-plugin-store (fichier JSON dans AppData).
// Fallback : localStorage (mode navigateur / dev Vite).
// Architecture : initStorage() charge tout en mémoire au démarrage.
// Les lectures sont synchrones (depuis le cache mémoire).
// Les écritures sont synchrones en mémoire + asynchrones vers le store.
// Migration automatique depuis localStorage si le store est vierge.

import { load, type Store } from '@tauri-apps/plugin-store';

// Clés de stockage utilisées dans toute l'application — centralisées ici pour éviter les fautes de frappe
export const STORAGE_KEYS = {
  settings:            'arctive.settings.v1',
  games:               'arctive.library.games.v1',
  rawgCache:           'arctive.rawg.cache.v5',
  launcherIcons:       'arctive.launcherIcons.v1',
  musicFolder:         'music_folder',
  musicVolume:         'music_volume',
  musicLastTrack:      'music_last_track',
  musicColors:         'music_folder_colors',
  musicEnrichedMeta:   'music_enriched_meta',
  musicShuffle:        'music_shuffle',
  ambientEnabled:      'ambient_enabled',
  ambientVolume:       'ambient_volume',
  musicRepeat:         'music_repeat',
  musicRecentlyPlayed: 'music_recently_played',
  language:            'arctive.language',
  patchNotesSeen:      'arctive.patchNotes.seen',
} as const;

// Cache mémoire synchrone — toutes les lectures passent par ici pour éviter l'asynchronisme
const mem: Record<string, string> = {};
let store: Store | null = null;
let ready = false;

// Détecte si l'application tourne dans Tauri (desktop) ou dans un navigateur (dev)
function isTauri(): boolean {
  return !!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
}

// Initialise le stockage — doit être appelé UNE SEULE FOIS avant le premier rendu React
// Charge toutes les données connues en mémoire et migre depuis localStorage si nécessaire
export async function initStorage(): Promise<void> {
  if (ready) return;
  ready = true;

  if (!isTauri()) {
    // Mode navigateur (dev Vite) : lit directement depuis localStorage
    for (const key of Object.values(STORAGE_KEYS)) {
      const v = window.localStorage.getItem(key);
      if (v !== null) mem[key] = v;
    }
    return;
  }

  try {
    store = await load('archive.json', { autoSave: true, defaults: {} });

    // Charge toutes les clés connues dans le cache mémoire
    let hasData = false;
    for (const key of Object.values(STORAGE_KEYS)) {
      const val = await store.get<string>(key);
      if (val !== null && val !== undefined) {
        mem[key] = val;
        hasData = true;
      }
    }

    // Si le store est vierge (première installation), migre les données depuis localStorage
    if (!hasData) {
      console.info('[storage] Store vierge — migration depuis localStorage');
      const migrations: Promise<void>[] = [];
      for (const key of Object.values(STORAGE_KEYS)) {
        const v = window.localStorage.getItem(key);
        if (v !== null) {
          mem[key] = v;
          migrations.push(store.set(key, v));
        }
      }
      await Promise.all(migrations);
    }
  } catch (err) {
    console.warn('[storage] Tauri store indisponible, fallback localStorage', err);
    store = null;
    for (const key of Object.values(STORAGE_KEYS)) {
      const v = window.localStorage.getItem(key);
      if (v !== null) mem[key] = v;
    }
  }
}

// Lit une valeur depuis le cache mémoire de manière synchrone
function rawRead(key: string): string | null {
  return mem[key] ?? null;
}

// Écrit une valeur en mémoire immédiatement, puis la persiste de façon asynchrone dans le store
function rawWrite(key: string, value: string): void {
  mem[key] = value;
  if (store) {
    store.set(key, value).catch(err => console.error('[storage] write error', err));
  } else {
    try { window.localStorage?.setItem(key, value); } catch { /* quota dépassé */ }
  }
}

// Supprime une valeur du cache mémoire et du store
function rawRemove(key: string): void {
  delete mem[key];
  if (store) {
    store.delete(key).catch(err => console.error('[storage] delete error', err));
  } else {
    try { window.localStorage?.removeItem(key); } catch { /* ignorer */ }
  }
}

// Lit et désérialise une valeur JSON depuis le stockage
export function readJSON<T>(key: string): T | null {
  const raw = rawRead(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; }
  catch { return null; }
}

// Sérialise et écrit une valeur JSON dans le stockage
export function writeJSON<T>(key: string, value: T): void {
  rawWrite(key, JSON.stringify(value));
}

// Lecture/écriture des paramètres de l'application
export function readSettingsRaw(): string | null  { return rawRead(STORAGE_KEYS.settings); }
export function writeSettingsRaw(json: string): void { rawWrite(STORAGE_KEYS.settings, json); }

// Lecture/écriture de la bibliothèque de jeux
export function readGamesRaw(): string | null  { return rawRead(STORAGE_KEYS.games); }
export function writeGamesRaw(json: string): void { rawWrite(STORAGE_KEYS.games, json); }

// Lecture/écriture/suppression du cache d'images RAWG
export function readRawgCacheRaw(): string | null  { return rawRead(STORAGE_KEYS.rawgCache); }
export function writeRawgCacheRaw(json: string): void { rawWrite(STORAGE_KEYS.rawgCache, json); }
export function removeRawgCache(): void { rawRemove(STORAGE_KEYS.rawgCache); }

// Lecture/écriture du cache des icônes de launchers
export function readLauncherIconsRaw(): string | null  { return rawRead(STORAGE_KEYS.launcherIcons); }
export function writeLauncherIconsRaw(json: string): void { rawWrite(STORAGE_KEYS.launcherIcons, json); }

// Lecture/écriture du dossier musique sélectionné
export function readMusicFolder(): string { return rawRead(STORAGE_KEYS.musicFolder) ?? ''; }
export function writeMusicFolder(path: string): void { rawWrite(STORAGE_KEYS.musicFolder, path); }

// Lecture/écriture du volume du lecteur audio (entre 0 et 1)
export function readMusicVolume(): number {
  const v = parseFloat(rawRead(STORAGE_KEYS.musicVolume) ?? '');
  return isNaN(v) ? 0.5 : v;
}
export function writeMusicVolume(v: number): void { rawWrite(STORAGE_KEYS.musicVolume, String(v)); }

// Lecture/écriture de l'index de la dernière piste jouée (pour reprendre au redémarrage)
export function readMusicLastTrack(): number {
  return parseInt(rawRead(STORAGE_KEYS.musicLastTrack) ?? '-1', 10);
}
export function writeMusicLastTrack(idx: number): void { rawWrite(STORAGE_KEYS.musicLastTrack, String(idx)); }

// Lecture/écriture des couleurs associées à chaque dossier musical
export function readMusicFolderColors(): Record<string, string> {
  return readJSON<Record<string, string>>(STORAGE_KEYS.musicColors) ?? {};
}
export function writeMusicFolderColors(colors: Record<string, string>): void {
  writeJSON(STORAGE_KEYS.musicColors, colors);
}

// Lecture/écriture du mode aléatoire (shuffle) du lecteur
export function readMusicShuffle(): boolean {
  return rawRead(STORAGE_KEYS.musicShuffle) === 'true';
}
export function writeMusicShuffle(v: boolean): void {
  rawWrite(STORAGE_KEYS.musicShuffle, String(v));
}

// Type des modes de répétition du lecteur
export type RepeatMode = 'none' | 'one' | 'all';

// Lecture/écriture du mode de répétition ('none' | 'one' | 'all')
export function readMusicRepeat(): RepeatMode {
  const v = rawRead(STORAGE_KEYS.musicRepeat);
  return (v === 'one' || v === 'all') ? v : 'none';
}
export function writeMusicRepeat(v: RepeatMode): void {
  rawWrite(STORAGE_KEYS.musicRepeat, v);
}

// Lecture/écriture des 10 dernières pistes écoutées (chemins absolus, ordre antéchronologique)
export function readMusicRecentlyPlayed(): string[] {
  return readJSON<string[]>(STORAGE_KEYS.musicRecentlyPlayed) ?? [];
}
export function writeMusicRecentlyPlayed(paths: string[]): void {
  writeJSON(STORAGE_KEYS.musicRecentlyPlayed, paths);
}

// Lecture/écriture des métadonnées enrichies (iTunes/Deezer) persistées entre les sessions
export function readMusicEnrichedMetaRaw(): string | null {
  return rawRead(STORAGE_KEYS.musicEnrichedMeta);
}
export function writeMusicEnrichedMetaRaw(json: string): void {
  rawWrite(STORAGE_KEYS.musicEnrichedMeta, json);
}

// Lecture/écriture de la musique d'ambiance (activée par défaut, volume 0.25)
export function readAmbientEnabled(): boolean {
  const v = rawRead(STORAGE_KEYS.ambientEnabled);
  return v === null ? true : v === 'true';
}
export function writeAmbientEnabled(v: boolean): void { rawWrite(STORAGE_KEYS.ambientEnabled, String(v)); }

export function readAmbientVolume(): number {
  const v = parseFloat(rawRead(STORAGE_KEYS.ambientVolume) ?? '');
  return isNaN(v) ? 0.25 : Math.max(0, Math.min(1, v));
}
export function writeAmbientVolume(v: number): void { rawWrite(STORAGE_KEYS.ambientVolume, String(v)); }

// Lecture/écriture de la langue de l'interface
export function readLanguage(): string | null { return rawRead(STORAGE_KEYS.language); }
export function writeLanguage(lang: string): void { rawWrite(STORAGE_KEYS.language, lang); }

// Retourne la version dont l'utilisateur a explicitement fermé le popup de notes de mise à jour
export function readPatchNotesSeen(): string | null { return rawRead(STORAGE_KEYS.patchNotesSeen); }

// Marque une version comme "ne plus afficher au démarrage"
export function writePatchNotesSeen(version: string): void { rawWrite(STORAGE_KEYS.patchNotesSeen, version); }

// Réactive l'affichage au démarrage pour la version courante
export function removePatchNotesSeen(): void { rawRemove(STORAGE_KEYS.patchNotesSeen); }

// Supprime toutes les données persistées (en mémoire + store/localStorage)
export async function clearAllStorage(): Promise<void> {
  for (const key of Object.keys(mem)) delete mem[key];
  if (store) {
    await store.clear();
  } else {
    window.localStorage?.clear();
  }
}

// Supprime toutes les données sauf celles dont les clés sont dans keysToKeep (ex: clé RAWG)
export async function clearStoragePreserving(keysToKeep: string[]): Promise<void> {
  const saved: Record<string, string> = {};
  for (const key of keysToKeep) {
    const v = mem[key];
    if (v !== undefined) saved[key] = v;
  }
  await clearAllStorage();
  for (const [key, value] of Object.entries(saved)) {
    rawWrite(key, value);
  }
}
