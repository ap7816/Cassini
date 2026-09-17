import type { Game } from '../../types';
import { tauriInvoke } from '../../../services/tauri';

/**
 * Désinstallation d'un jeu, confiée à son propre désinstalleur.
 *
 * Cassini ne supprime aucun fichier : il lance le programme que le jeu a
 * déclaré à Windows, ou la boîte de dialogue de Steam. C'est donc ce
 * programme-là qui pose la dernière question et fait le travail — et c'est
 * pourquoi on ne peut pas savoir ici si la désinstallation a abouti. Le
 * prochain scan s'en chargera : il marquera le jeu non installé.
 */

/** Nom du désinstalleur trouvé, ou `null` s'il n'y en a pas. */
export async function trouverDesinstalleur(game: Game): Promise<string | null> {
  try {
    const d = await tauriInvoke<{ nom: string } | null>('find_uninstaller', {
      title: game.title,
      path: game.installPath ?? null,
    });
    return d?.nom ?? null;
  } catch {
    return null;
  }
}

/** Lance la désinstallation. Renvoie ce qui a été lancé (« Steam », un nom…). */
export function desinstallerJeu(game: Game): Promise<string> {
  return tauriInvoke<string>('uninstall_game', {
    platform: game.platform,
    id: game.id,
    title: game.title,
    path: game.installPath ?? null,
  });
}
