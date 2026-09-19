import { STORAGE_KEYS, readJSON, writeJSON } from '../../../services/storage';
import { cleSysteme, estSystemePerso, type SystemePerso } from './customSystems';

/**
 * Système devant lequel la vue s'ouvre.
 *
 * Réglage de l'application (`AppSettings.startSystem`) : le launcher le plus
 * fourni — le comportement historique —, le dernier système visité, ou la clé
 * d'un système précis, launcher ou système personnalisé.
 */
export const OUVERTURE_AUTO = 'auto';
export const OUVERTURE_DERNIER = 'dernier';

/**
 * Clé du système à ouvrir, ou `null` pour laisser la page choisir le launcher
 * le plus fourni.
 *
 * Un choix qui ne désigne plus rien — launcher sans jeu, système supprimé —
 * retombe sur ce comportement par défaut plutôt que d'ouvrir une vue vide.
 *
 * @param launchers plateformes présentes dans la bibliothèque
 */
export function systemeOuverture(
  choix: string,
  dernier: string | null,
  launchers: readonly string[],
  perso: readonly SystemePerso[],
): string | null {
  const cle = choix === OUVERTURE_DERNIER ? dernier : choix === OUVERTURE_AUTO ? null : choix;
  if (!cle) return null;
  if (estSystemePerso(cle)) return perso.some((s) => cleSysteme(s) === cle) ? cle : null;
  return launchers.includes(cle) ? cle : null;
}

export function lireDernierSysteme(): string | null {
  const v = readJSON<unknown>(STORAGE_KEYS.dernierSysteme);
  return typeof v === 'string' && v.length > 0 && v.length <= 128 ? v : null;
}

export function enregistrerDernierSysteme(cle: string): void {
  writeJSON(STORAGE_KEYS.dernierSysteme, cle);
}
