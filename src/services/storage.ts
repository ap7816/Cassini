// Point d'entrée unique pour toutes les opérations de persistance.
// Backend : tauri-plugin-store (fichier JSON dans AppData).
// Fallback : localStorage (mode navigateur / dev Vite).
// Architecture : initStorage() charge tout en mémoire au démarrage.
// Les lectures sont synchrones (depuis le cache mémoire).
// Les écritures sont synchrones en mémoire + asynchrones vers le store.
// Migration automatique depuis localStorage si le store est vierge.

import { load, type Store } from '@tauri-apps/plugin-store';

// Clés de stockage utilisées dans toute l'application — centralisées ici pour
// éviter les fautes de frappe, et toutes préfixées par `archive.` afin qu'une
// inspection du store dise immédiatement d'où vient chaque entrée.
//
// Le préfixe dit `archive.`, et le fichier du store `archive.json`, alors que
// l'application s'appelle désormais Cassini. Ce n'est pas un oubli : ces noms
// sont l'adresse des données, pas une étiquette. Les renommer obligerait chaque
// installation existante à une migration — et une migration qui échoue perd la
// bibliothèque, les réglages et le dossier musical de l'utilisateur. Le gain
// serait nul : personne ne les voit. On les laisse donc tels quels.
export const STORAGE_KEYS = {
  settings:            'archive.settings.v1',
  games:               'archive.library.games.v1',
  coverCache:          'archive.coverArt.cache.v5',
  launcherIcons:       'archive.launcherIcons.v1',
  musicFolder:         'archive.music.folder',
  musicVolume:         'archive.music.volume',
  musicLastTrack:      'archive.music.lastTrack',
  musicColors:         'archive.music.folderColors',
  musicEnrichedMeta:   'archive.music.enrichedMeta',
  musicShuffle:        'archive.music.shuffle',
  musicRepeat:         'archive.music.repeat',
  musicRecentlyPlayed: 'archive.music.recentlyPlayed',
  ambientEnabled:      'archive.ambient.enabled',
  ambientVolume:       'archive.ambient.volume',
  language:            'archive.language',
  patchNotesSeen:      'archive.patchNotes.seen',
  solarFlyKeys:        'archive.solar.flyKeys.v1',
  systemesPerso:       'archive.solar.customSystems.v1',
  solarLargeurs:       'archive.solar.largeurs.v1',
} as const;

/**
 * Nom historique de chaque clé, indexé par son nom actuel.
 *
 * Les anciennes clés portaient « arctive » — une coquille pour « archive » —
 * et celles de la musique n'avaient aucun préfixe. Sans cette table, corriger
 * les noms ferait perdre à toute installation existante sa bibliothèque, ses
 * réglages et son dossier musique : le code chercherait des clés que le store
 * ne contient pas.
 *
 * `initStorage` déplace la valeur sous le nouveau nom au premier démarrage,
 * puis supprime l'ancienne entrée. La table peut disparaître quand plus aucune
 * installation antérieure ne subsiste.
 */
const LEGACY_KEYS: Record<string, string> = {
  'archive.settings.v1':            'arctive.settings.v1',
  'archive.library.games.v1':       'arctive.library.games.v1',
  'archive.coverArt.cache.v5':      'arctive.rawg.cache.v5',
  'archive.launcherIcons.v1':       'arctive.launcherIcons.v1',
  'archive.language':               'arctive.language',
  'archive.patchNotes.seen':        'arctive.patchNotes.seen',
  'archive.music.folder':           'music_folder',
  'archive.music.volume':           'music_volume',
  'archive.music.lastTrack':        'music_last_track',
  'archive.music.folderColors':     'music_folder_colors',
  'archive.music.enrichedMeta':     'music_enriched_meta',
  'archive.music.shuffle':          'music_shuffle',
  'archive.music.repeat':           'music_repeat',
  'archive.music.recentlyPlayed':   'music_recently_played',
  'archive.ambient.enabled':        'ambient_enabled',
  'archive.ambient.volume':         'ambient_volume',
};

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
    loadFromLocalStorage();
    return;
  }

  try {
    store = await load('archive.json', { autoSave: true, defaults: {} });

    // Tout le contenu du store en un seul appel.
    //
    // La version précédente lisait clé par clé, en attendant chaque réponse
    // avant de demander la suivante : une vingtaine d'allers-retours IPC en
    // série, doublés pour les clés absentes qu'il fallait rechercher sous leur
    // nom historique. Le premier rendu de React attend cette boucle. Or le
    // store est déjà entièrement en mémoire côté Rust — le fichier a été lu par
    // `load` juste au-dessus — donc tout demander d'un coup transfère les mêmes
    // données pour un seul message.
    const tout = new Map<string, unknown>(await store.entries());

    // Les valeurs ont toujours été écrites sous forme de chaînes (`rawWrite`
    // sérialise). Une valeur d'un autre type ne peut venir que d'un fichier
    // modifié à la main : on l'ignore plutôt que de la propager telle quelle
    // dans un cache que tout le reste du code traite comme du texte.
    const chaine = (k: string): string | undefined => {
      const v = tout.get(k);
      return typeof v === 'string' ? v : undefined;
    };

    // Charge toutes les clés connues, en retombant sur leur nom historique
    let hasData = false;
    const renames: Promise<void>[] = [];

    for (const key of Object.values(STORAGE_KEYS)) {
      let val = chaine(key);

      if (val === undefined) {
        const legacy = LEGACY_KEYS[key];
        if (legacy) {
          const old = chaine(legacy);
          if (old !== undefined) {
            val = old;
            // Réécrit sous le nouveau nom, puis retire l'ancienne entrée
            renames.push(store.set(key, old), store.delete(legacy).then(() => undefined));
          }
        }
      }

      if (val !== undefined) {
        mem[key] = val;
        hasData = true;
      }
    }

    if (renames.length > 0) {
      console.info(`[storage] ${renames.length / 2} clés migrées vers le nouveau nommage`);
      await Promise.all(renames);
    }

    // Store vierge (première installation) : reprend ce qui traîne en localStorage
    if (!hasData) {
      console.info('[storage] Store vierge — migration depuis localStorage');
      loadFromLocalStorage();
      await Promise.all(
        Object.entries(mem).map(([key, value]) => store!.set(key, value)),
      );
    }
  } catch (err) {
    console.warn('[storage] Tauri store indisponible, fallback localStorage', err);
    store = null;
    loadFromLocalStorage();
  }
}

/**
 * Remplit le cache mémoire depuis localStorage, en acceptant les noms
 * historiques. Sert au mode navigateur et de filet quand le store Tauri est
 * indisponible.
 */
function loadFromLocalStorage(): void {
  for (const key of Object.values(STORAGE_KEYS)) {
    const legacy = LEGACY_KEYS[key];
    const v =
      window.localStorage.getItem(key) ??
      (legacy ? window.localStorage.getItem(legacy) : null);
    if (v !== null) mem[key] = v;
  }
}

// Lit une valeur depuis le cache mémoire de manière synchrone
function rawRead(key: string): string | null {
  return mem[key] ?? null;
}

// Écrit une valeur en mémoire immédiatement, puis la persiste de façon asynchrone dans le store.
// Toujours mirrée dans localStorage pour que le preloader HTML puisse la lire sans attendre le store.
function rawWrite(key: string, value: string): void {
  mem[key] = value;
  try { window.localStorage?.setItem(key, value); } catch { /* quota dépassé */ }
  if (store) {
    store.set(key, value).catch(err => console.error('[storage] write error', err));
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

// Lecture/écriture/suppression du cache d'URLs de jaquettes
export function readCoverCacheRaw(): string | null  { return rawRead(STORAGE_KEYS.coverCache); }
export function writeCoverCacheRaw(json: string): void { rawWrite(STORAGE_KEYS.coverCache, json); }
export function removeCoverCache(): void { rawRemove(STORAGE_KEYS.coverCache); }

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
/**
 * Touches de déplacement du système solaire, sérialisées en JSON.
 *
 * Pas de clé historique : le réglage n'existait pas avant, il n'y a donc rien
 * à migrer.
 */
export function readSolarFlyKeys(): string | null {
  return rawRead(STORAGE_KEYS.solarFlyKeys);
}
export function writeSolarFlyKeys(json: string): void {
  rawWrite(STORAGE_KEYS.solarFlyKeys, json);
}

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

// Supprime toutes les données sauf celles dont les clés sont dans keysToKeep
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
