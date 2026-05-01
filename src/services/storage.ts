/**
 * storage.ts — Point d'entrée UNIQUE pour toutes les opérations de persistance.
 *
 * Règle : window.localStorage n'est appelé QUE dans ce fichier.
 * Pour migrer vers tauri-plugin-store, SQLite ou n'importe quoi d'autre,
 * il suffit de modifier les fonctions rawRead / rawWrite / rawRemove ci-dessous.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Clés — toutes au même endroit pour éviter les fautes de frappe
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
// Couche basse — seul endroit qui touche à window.localStorage
// ─────────────────────────────────────────────────────────────────────────────
function ls(): Storage | null {
  return typeof window !== 'undefined' ? window.localStorage : null;
}

function rawRead(key: string): string | null {
  return ls()?.getItem(key) ?? null;
}

function rawWrite(key: string, value: string): void {
  try { ls()?.setItem(key, value); } catch { /* quota dépassé — ignorer */ }
}

function rawRemove(key: string): void {
  ls()?.removeItem(key);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers génériques
// ─────────────────────────────────────────────────────────────────────────────

/** Lit une valeur JSON — retourne null si absente ou invalide. */
export function readJSON<T>(key: string): T | null {
  const raw = rawRead(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; }
  catch { return null; }
}

/** Écrit une valeur en JSON. */
export function writeJSON<T>(key: string, value: T): void {
  rawWrite(key, JSON.stringify(value));
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────
export function readSettingsRaw(): string | null {
  return rawRead(STORAGE_KEYS.settings);
}

export function writeSettingsRaw(json: string): void {
  rawWrite(STORAGE_KEYS.settings, json);
}

// ─────────────────────────────────────────────────────────────────────────────
// Bibliothèque de jeux
// ─────────────────────────────────────────────────────────────────────────────
export function readGamesRaw(): string | null {
  return rawRead(STORAGE_KEYS.games);
}

export function writeGamesRaw(json: string): void {
  rawWrite(STORAGE_KEYS.games, json);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache RAWG (URLs d'images)
// ─────────────────────────────────────────────────────────────────────────────
export function readRawgCacheRaw(): string | null {
  return rawRead(STORAGE_KEYS.rawgCache);
}

export function writeRawgCacheRaw(json: string): void {
  rawWrite(STORAGE_KEYS.rawgCache, json);
}

export function removeRawgCache(): void {
  rawRemove(STORAGE_KEYS.rawgCache);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache icônes launchers
// ─────────────────────────────────────────────────────────────────────────────
export function readLauncherIconsRaw(): string | null {
  return rawRead(STORAGE_KEYS.launcherIcons);
}

export function writeLauncherIconsRaw(json: string): void {
  rawWrite(STORAGE_KEYS.launcherIcons, json);
}

// ─────────────────────────────────────────────────────────────────────────────
// Musique
// ─────────────────────────────────────────────────────────────────────────────
export function readMusicFolder(): string {
  return rawRead(STORAGE_KEYS.musicFolder) ?? '';
}

export function writeMusicFolder(path: string): void {
  rawWrite(STORAGE_KEYS.musicFolder, path);
}

export function readMusicVolume(): number {
  const v = parseFloat(rawRead(STORAGE_KEYS.musicVolume) ?? '');
  return isNaN(v) ? 0.5 : v;
}

export function writeMusicVolume(v: number): void {
  rawWrite(STORAGE_KEYS.musicVolume, String(v));
}

export function readMusicLastTrack(): number {
  return parseInt(rawRead(STORAGE_KEYS.musicLastTrack) ?? '-1', 10);
}

export function writeMusicLastTrack(idx: number): void {
  rawWrite(STORAGE_KEYS.musicLastTrack, String(idx));
}

export function readMusicFolderColors(): Record<string, string> {
  return readJSON<Record<string, string>>(STORAGE_KEYS.musicColors) ?? {};
}

export function writeMusicFolderColors(colors: Record<string, string>): void {
  writeJSON(STORAGE_KEYS.musicColors, colors);
}

// ─────────────────────────────────────────────────────────────────────────────
// Langue
// ─────────────────────────────────────────────────────────────────────────────
export function readLanguage(): string | null {
  return rawRead(STORAGE_KEYS.language);
}

export function writeLanguage(lang: string): void {
  rawWrite(STORAGE_KEYS.language, lang);
}

// ─────────────────────────────────────────────────────────────────────────────
// Reset
// ─────────────────────────────────────────────────────────────────────────────

/** Efface tout le stockage. */
export function clearAllStorage(): void {
  ls()?.clear();
}

/**
 * Efface tout le stockage SAUF les clés listées.
 * Utile pour le "reset app" qui préserve la clé RAWG.
 */
export function clearStoragePreserving(keysToKeep: string[]): void {
  const storage = ls();
  if (!storage) return;
  const saved: Record<string, string> = {};
  for (const key of keysToKeep) {
    const v = storage.getItem(key);
    if (v !== null) saved[key] = v;
  }
  storage.clear();
  for (const [key, value] of Object.entries(saved)) {
    storage.setItem(key, value);
  }
}
