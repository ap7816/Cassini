/**
 * storage.ts — Point d'entrée UNIQUE pour toutes les opérations de persistance.
 *
 * Backend : tauri-plugin-store (fichier JSON dans AppData).
 * Fallback : localStorage (mode navigateur / dev Vite).
 *
 * Architecture :
 *  - `initStorage()` charge tout en mémoire au démarrage (une seule fois).
 *  - Les lectures sont SYNCHRONES (depuis le cache mémoire).
 *  - Les écritures sont synchrones en mémoire + asynchrones vers le store.
 *  - Migration automatique depuis localStorage si le store est vierge.
 *
 * Pour changer de backend à l'avenir : modifier uniquement rawRead/rawWrite/rawRemove.
 */

import { load, type Store } from '@tauri-apps/plugin-store';

// ─────────────────────────────────────────────────────────────────────────────
// Clés
// ─────────────────────────────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  settings:       'arctive.settings.v1',
  games:          'arctive.library.games.v1',
  rawgCache:      'arctive.rawg.cache.v5',
  launcherIcons:  'arctive.launcherIcons.v1',
  musicFolder:    'music_folder',
  musicVolume:    'music_volume',
  musicLastTrack: 'music_last_track',
  musicColors:    'music_folder_colors',
  language:       'arctive.language',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Cache mémoire + instance store
// ─────────────────────────────────────────────────────────────────────────────
const mem: Record<string, string> = {};
let store: Store | null = null;
let ready = false;

function isTauri(): boolean {
  return !!(window as Record<string, unknown>).__TAURI_INTERNALS__;
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialisation — appeler UNE SEULE FOIS avant le rendu React
// ─────────────────────────────────────────────────────────────────────────────
export async function initStorage(): Promise<void> {
  if (ready) return;
  ready = true;

  if (!isTauri()) {
    // Mode navigateur (dev Vite) : charger depuis localStorage
    for (const key of Object.values(STORAGE_KEYS)) {
      const v = window.localStorage.getItem(key);
      if (v !== null) mem[key] = v;
    }
    return;
  }

  try {
    store = await load('archive.json', { autoSave: true });

    // Charger toutes les clés connues en mémoire
    let hasData = false;
    for (const key of Object.values(STORAGE_KEYS)) {
      const val = await store.get<string>(key);
      if (val !== null && val !== undefined) {
        mem[key] = val;
        hasData = true;
      }
    }

    // Migration automatique depuis localStorage si le store est vierge
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

// ─────────────────────────────────────────────────────────────────────────────
// Primitives internes
// ─────────────────────────────────────────────────────────────────────────────
function rawRead(key: string): string | null {
  return mem[key] ?? null;
}

function rawWrite(key: string, value: string): void {
  mem[key] = value;
  if (store) {
    store.set(key, value).catch(err => console.error('[storage] write error', err));
  } else {
    try { window.localStorage?.setItem(key, value); } catch { /* quota */ }
  }
}

function rawRemove(key: string): void {
  delete mem[key];
  if (store) {
    store.delete(key).catch(err => console.error('[storage] delete error', err));
  } else {
    try { window.localStorage?.removeItem(key); } catch { /* ignore */ }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers génériques
// ─────────────────────────────────────────────────────────────────────────────
export function readJSON<T>(key: string): T | null {
  const raw = rawRead(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; }
  catch { return null; }
}

export function writeJSON<T>(key: string, value: T): void {
  rawWrite(key, JSON.stringify(value));
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────
export function readSettingsRaw(): string | null  { return rawRead(STORAGE_KEYS.settings); }
export function writeSettingsRaw(json: string): void { rawWrite(STORAGE_KEYS.settings, json); }

// ─────────────────────────────────────────────────────────────────────────────
// Bibliothèque de jeux
// ─────────────────────────────────────────────────────────────────────────────
export function readGamesRaw(): string | null  { return rawRead(STORAGE_KEYS.games); }
export function writeGamesRaw(json: string): void { rawWrite(STORAGE_KEYS.games, json); }

// ─────────────────────────────────────────────────────────────────────────────
// Cache RAWG
// ─────────────────────────────────────────────────────────────────────────────
export function readRawgCacheRaw(): string | null  { return rawRead(STORAGE_KEYS.rawgCache); }
export function writeRawgCacheRaw(json: string): void { rawWrite(STORAGE_KEYS.rawgCache, json); }
export function removeRawgCache(): void { rawRemove(STORAGE_KEYS.rawgCache); }

// ─────────────────────────────────────────────────────────────────────────────
// Cache icônes launchers
// ─────────────────────────────────────────────────────────────────────────────
export function readLauncherIconsRaw(): string | null  { return rawRead(STORAGE_KEYS.launcherIcons); }
export function writeLauncherIconsRaw(json: string): void { rawWrite(STORAGE_KEYS.launcherIcons, json); }

// ─────────────────────────────────────────────────────────────────────────────
// Musique
// ─────────────────────────────────────────────────────────────────────────────
export function readMusicFolder(): string { return rawRead(STORAGE_KEYS.musicFolder) ?? ''; }
export function writeMusicFolder(path: string): void { rawWrite(STORAGE_KEYS.musicFolder, path); }

export function readMusicVolume(): number {
  const v = parseFloat(rawRead(STORAGE_KEYS.musicVolume) ?? '');
  return isNaN(v) ? 0.5 : v;
}
export function writeMusicVolume(v: number): void { rawWrite(STORAGE_KEYS.musicVolume, String(v)); }

export function readMusicLastTrack(): number {
  return parseInt(rawRead(STORAGE_KEYS.musicLastTrack) ?? '-1', 10);
}
export function writeMusicLastTrack(idx: number): void { rawWrite(STORAGE_KEYS.musicLastTrack, String(idx)); }

export function readMusicFolderColors(): Record<string, string> {
  return readJSON<Record<string, string>>(STORAGE_KEYS.musicColors) ?? {};
}
export function writeMusicFolderColors(colors: Record<string, string>): void {
  writeJSON(STORAGE_KEYS.musicColors, colors);
}

// ─────────────────────────────────────────────────────────────────────────────
// Langue
// ─────────────────────────────────────────────────────────────────────────────
export function readLanguage(): string | null { return rawRead(STORAGE_KEYS.language); }
export function writeLanguage(lang: string): void { rawWrite(STORAGE_KEYS.language, lang); }

// ─────────────────────────────────────────────────────────────────────────────
// Reset
// ─────────────────────────────────────────────────────────────────────────────
export async function clearAllStorage(): Promise<void> {
  for (const key of Object.keys(mem)) delete mem[key];
  if (store) {
    await store.clear();
  } else {
    window.localStorage?.clear();
  }
}

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
