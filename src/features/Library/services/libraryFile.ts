import type { Game } from '../../types';
import { normalizeGames } from './libraryStorage';

type ExportPayload = {
  version: 1;
  exportedAt: string;
  games: Game[];
};

// Détecte si le code s'exécute dans l'environnement Tauri (app desktop)
function isTauri(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__TAURI__);
}

// Raccourci pour accéder aux plugins dialog et fs de Tauri
function getTauriApis() {
  return {
    dialog: window.__TAURI__?.dialog,
    fs: window.__TAURI__?.fs,
  };
}

// Exporte la bibliothèque vers un fichier JSON : dialogue natif sur desktop, téléchargement dans le navigateur
export async function exportLibraryToFile(games: Game[]): Promise<void> {
  const payload: ExportPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    games,
  };

  const json = JSON.stringify(payload, null, 2);

  if (isTauri()) {
    const { dialog, fs } = getTauriApis();

    if (!dialog?.save || !fs?.writeTextFile) {
      throw new Error('Tauri dialog/fs APIs not available.');
    }

    const path = await dialog.save({
      defaultPath: 'arctive-library.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });

    // L'utilisateur a annulé le dialogue
    if (!path) return;

    await fs.writeTextFile(path, json);
    return;
  }

  // Fallback navigateur : génère un lien de téléchargement temporaire
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'arctive-library.json';
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

// Importe des jeux depuis un fichier JSON : dialogue natif sur desktop, sélecteur de fichier dans le navigateur
export async function importLibraryFromFile(): Promise<Game[]> {
  if (isTauri()) {
    const { dialog, fs } = getTauriApis();

    if (!dialog?.open || !fs?.readTextFile) {
      throw new Error('Tauri dialog/fs APIs not available.');
    }

    const path = await dialog.open({
      multiple: false,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });

    if (!path || typeof path !== 'string') return [];

    const txt = await fs.readTextFile(path);
    return parseImport(txt);
  }

  // Fallback navigateur : file picker HTML
  const file = await pickJsonFileInBrowser();
  if (!file) return [];

  const txt = await file.text();
  return parseImport(txt);
}

// Vérifie qu'une valeur est un objet non-null (guard de type)
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

// Parse le JSON importé en acceptant deux formats : { games: [...] } ou directement [...]
function parseImport(txt: string): Game[] {
  try {
    const parsed: unknown = JSON.parse(txt);

    const gamesRaw =
      isRecord(parsed) && 'games' in parsed ? (parsed as Record<string, unknown>).games : parsed;

    return normalizeGames(gamesRaw);
  } catch {
    throw new Error('Invalid JSON file.');
  }
}

// Ouvre un sélecteur de fichier JSON dans le navigateur via un <input type="file"> temporaire
function pickJsonFileInBrowser(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}
