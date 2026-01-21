import type { Game } from '../../types';

function basename(path: string): string {
  // Support Windows + Unix
  const parts = path.split(/[/\\]+/);
  return parts[parts.length - 1] ?? path;
}

function stripExtension(name: string): string {
  return name.replace(/\.[^/.]+$/, '');
}

function simpleHash(input: string): string {
  // hash stable simple (pas crypto) pour id
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export function createGameFromPath(path: string): Game {
  const fileName = basename(path);
  const title = stripExtension(fileName).trim() || 'New Game';

  return {
    id: `local-${simpleHash(path)}`,
    title,
    platform: 'Other',
    installed: true,
    lastPlayedAt: null,
    launchUrl: path, // on stocke le chemin brut (Tauri shell.open le gère)
    coverUrl: null,
  };
}
