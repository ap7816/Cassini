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

/**
 * Les deux noms désignent-ils la même chose ?
 *
 * Windows ne nomme pas toujours un jeu comme la bibliothèque : l'entrée du
 * registre porte l'édition, la ponctuation, parfois le nom de l'éditeur. Tant
 * que c'est le même nom à la ponctuation près, la confirmation n'a rien de
 * particulier à signaler ; dès qu'il diffère, elle doit dire ce qui va
 * réellement s'ouvrir — faute de quoi on lit « Désinstaller Fortnite ? » et
 * c'est le lanceur qui part.
 *
 * Comparaison lâche, comme du côté de Rust : la casse et tout ce qui n'est ni
 * lettre ni chiffre ne disent rien ici.
 */
export function memeNom(a: string, b: string): boolean {
  const reduire = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  return reduire(a) === reduire(b);
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
