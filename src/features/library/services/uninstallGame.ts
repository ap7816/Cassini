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

/** Une entrée « Applications installées » de Windows, proposée au choix. */
export type EntreeDesinstallation = {
  /** Désigne l'entrée dans le registre. Opaque : jamais interprétée ici. */
  cle: string;
  nom: string;
  editeur: string | null;
  emplacement: string | null;
  /** Ressemble au jeu cherché : proposée en tête de liste. */
  proche: boolean;
};

/**
 * Ce que Windows sait désinstaller, le plus ressemblant d'abord.
 *
 * Recours quand la recherche automatique ne trouve rien, parce qu'elle n'ose
 * que le nom exact ou le même dossier.
 */
export async function listerDesinstalleurs(game: Game): Promise<EntreeDesinstallation[]> {
  try {
    return await tauriInvoke<EntreeDesinstallation[]>('list_uninstallers', {
      title: game.title,
      path: game.installPath ?? null,
    });
  } catch {
    return [];
  }
}

/**
 * Désinstalle via l'entrée choisie par l'utilisateur.
 *
 * Seule la clé voyage : la ligne de commande est relue et revalidée côté Rust,
 * pour que rien venu de l'interface ne devienne un programme à exécuter.
 */
export function desinstallerParEntree(cle: string): Promise<string> {
  return tauriInvoke<string>('uninstall_entry', { key: cle });
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
