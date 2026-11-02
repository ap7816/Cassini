/**
 * Les préréglages de qualité, comme dans n'importe quel menu graphique.
 *
 * Un jeu ne demande pas à l'utilisateur de régler sept nombres : il lui propose
 * Bas, Moyen, Élevé, Ultra, et laisse ceux qui le veulent toucher au détail —
 * auquel cas le préréglage affiché passe à « Personnalisé ». C'est la
 * convention, et elle vaut parce qu'elle donne une sortie à qui n'a aucune idée
 * de ce qu'est un débordement lumineux : il essaie « Bas » et voit si cela
 * tourne mieux.
 *
 * **Le préréglage n'est pas stocké.** Il se déduit des valeurs, ce qui
 * supprime d'un coup toute la classe de bogues où l'étiquette dit « Élevé »
 * alors que les réglages disent autre chose. Le choisir écrit les valeurs ; en
 * changer une seule fait tomber l'étiquette sur « Personnalisé », toute seule.
 */

/** Ce qu'un préréglage décide. Le reste des réglages ne le regarde pas. */
export type ReglagesQualite = {
  /** Part de la résolution native à laquelle la scène est dessinée. */
  echelleRendu: number;
  /** Densité du champ d'étoiles. */
  densiteCiel: number;
  /** Débordement lumineux (le « bloom »). */
  debordement: boolean;
  /** Rideaux de gaz et tempêtes magnétiques. */
  cielVivant: boolean;
};

export type Preset = 'bas' | 'moyen' | 'eleve' | 'ultra';
/** Un préréglage, ou l'absence de préréglage. */
export type NiveauQualite = Preset | 'perso';

/** Les quatre crans, du plus économe au plus gourmand. */
export const PRESETS: Record<Preset, ReglagesQualite> = {
  bas: { echelleRendu: 0.5, densiteCiel: 0.5, debordement: false, cielVivant: false },
  moyen: { echelleRendu: 0.75, densiteCiel: 0.8, debordement: true, cielVivant: true },
  eleve: { echelleRendu: 1, densiteCiel: 1, debordement: true, cielVivant: true },
  ultra: { echelleRendu: 1.5, densiteCiel: 1.4, debordement: true, cielVivant: true },
};

/** L'ordre d'affichage, du plus bas au plus haut. */
export const ORDRE_PRESETS: Preset[] = ['bas', 'moyen', 'eleve', 'ultra'];

/**
 * Les échelles de rendu proposées, en part de la résolution native.
 *
 * Au-dessus de 100 %, la scène est dessinée plus grand que l'écran puis
 * réduite : c'est du suréchantillonnage, la façon la plus coûteuse et la plus
 * nette de lisser les bords. En dessous, elle est dessinée plus petit puis
 * étirée — et comme la mise à l'échelle vaut pour les deux côtés, 50 % ne
 * coûte pas la moitié mais le quart.
 */
export const ECHELLES = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** Les densités proposées, avec le nom qui va avec. */
export const DENSITES: Array<{ cle: string; valeur: number }> = [
  { cle: 'faible', valeur: 0.5 },
  { cle: 'moyenne', valeur: 0.8 },
  { cle: 'elevee', valeur: 1 },
  { cle: 'ultra', valeur: 1.4 },
];

/** Les limites d'images par seconde proposées. 0 vaut « sans limite ». */
export const LIMITES_IPS = [0, 30, 60, 120, 144];

/** Deux nombres assez proches pour venir du même réglage. */
function memeNombre(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.001;
}

/**
 * Quel préréglage correspond à ces valeurs, ou « perso » si aucun.
 *
 * Appelé à chaque rendu de la page des paramètres : quatre comparaisons de
 * quatre champs, autant dire rien.
 */
export function presetDe(r: ReglagesQualite): NiveauQualite {
  for (const nom of ORDRE_PRESETS) {
    const p = PRESETS[nom];
    if (
      memeNombre(p.echelleRendu, r.echelleRendu) &&
      memeNombre(p.densiteCiel, r.densiteCiel) &&
      p.debordement === r.debordement &&
      p.cielVivant === r.cielVivant
    ) {
      return nom;
    }
  }
  return 'perso';
}

/** Le cran de densité le plus proche d'une valeur stockée. */
export function densiteLaPlusProche(valeur: number): number {
  return DENSITES.reduce(
    (meilleure, d) =>
      Math.abs(d.valeur - valeur) < Math.abs(meilleure - valeur) ? d.valeur : meilleure,
    DENSITES[0].valeur,
  );
}
