import type { Game } from '../../../features/types';
import type { ReglageSysteme } from '../lib/customSystems';

/** État d'une planète tel que la scène l'a construit et placé. */
export type EtatPlanete = {
  id: string;
  /** Distance actuelle au soleil. */
  distance: number;
  /** Distance calculée, sans placement. */
  distanceBase: number;
  /** En deçà, la planète entrerait dans le soleil. */
  distanceMin: number;
  /** Position sur l'orbite, en degrés. */
  angle: number;
  taille: number;
};

export type EtatEdition = {
  planetes: EtatPlanete[];
  /** Distance la plus grande proposée pour ce système. */
  distanceMax: number;
};

/**
 * Pilotage d'un système personnalisé depuis l'éditeur.
 *
 * Rien de tout cela ne reconstruit la scène : seules les planètes du système
 * concerné sont rebâties, et seulement quand sa liste de jeux change. La caméra
 * reste où elle est.
 */
export type EditionScene = {
  /** Construit le système s'il ne l'est pas, et rend son état. */
  lire(cle: string): EtatEdition | null;
  /**
   * Aperçu en direct d'un brouillon. Les orbites sont figées pendant la
   * session : on place une planète là où on la voit.
   */
  apercu(cle: string, jeux: Game[], reglage: ReglageSysteme): EtatEdition | null;
  /**
   * Fin de session. `recharger` rebâtit le système depuis les données
   * enregistrées — pour une annulation ; après un enregistrement, l'aperçu
   * est déjà l'état voulu.
   */
  terminer(cle: string, recharger: boolean): void;
  /** Hors session : rebâtit un système dont les jeux enregistrés ont changé. */
  recharger(cle: string): void;
};

export const EDITION_INERTE: EditionScene = {
  lire: () => null,
  apercu: () => null,
  terminer: () => {},
  recharger: () => {},
};
