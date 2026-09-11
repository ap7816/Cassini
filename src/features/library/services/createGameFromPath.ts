import type { Game } from '../../types';
import i18n from '../../../i18n';

// Extrait le dernier segment d'un chemin (compatible Windows et Unix)
function basename(path: string): string {
  const parts = path.split(/[/\\]+/);
  return parts[parts.length - 1] ?? path;
}

// Retire l'extension du nom de fichier pour obtenir un titre lisible
function stripExtension(name: string): string {
  return name.replace(/\.[^/.]+$/, '');
}

// Génère un identifiant stable non-cryptographique à partir du chemin absolu
function simpleHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

// Crée un objet Game minimal à partir d'un chemin vers un exécutable ou raccourci
export function createGameFromPath(path: string): Game {
  const fileName = basename(path);
  const title = stripExtension(fileName).trim() || i18n.t('library.newGame');

  return {
    id: `local-${simpleHash(path)}`,
    title,
    platform: 'Other',
    installed: true,
    lastPlayedAt: null,
    launchUrl: path,
  };
}
