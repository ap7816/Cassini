import { REGLAGES_DEFAUT, lireReglages } from '../../../features/debug/tuning';

/**
 * Cadrage d'une planète sélectionnée, de façon à laisser place à sa fiche.
 *
 * Pur et sans dépendance à Three.js : le raisonnement tient en quelques
 * grandeurs, et il vaut mieux le vérifier par le calcul que le découvrir sur
 * une capture d'écran.
 */

/** Écart entre la fiche et le bord apparent de la planète, en pixels. */
const ECART = 14;
/** Marge conservée entre la fiche et le bord de la bande libre. */
const MARGE = 30;

/**
 * Bornes de la largeur de fiche, et sa part de la bande disponible.
 *
 * Une largeur fixe ne pouvait pas convenir : 300 px occupent le tiers d'une
 * bande large et la moitié d'une bande étroite. La fiche paraissait alors
 * démesurée, et c'est ce que l'utilisateur a signalé — elle doit être à
 * l'échelle de la fenêtre, pas d'une valeur choisie une fois.
 *
 * Affine plutôt que proportionnelle : à 30 % d'une bande étroite la fiche
 * devient illisible avant d'atteindre son plancher, alors qu'une part fixe
 * assortie d'une base garde un texte utilisable partout.
 */
//
// Les valeurs vivent dans les réglages, où le panneau de débogage les ajuste.
// Le plancher par défaut reste exporté pour qui doit raisonner sur la borne
// d'origine plutôt que sur celle du moment.
export const FICHE_PLANCHER = REGLAGES_DEFAUT.ficheMini;

/** Largeur de fiche visée pour une bande donnée, bornes comprises. */
export function largeurFicheVoulue(bande: number): number {
  const r = lireReglages();
  if (!(bande > 0)) return r.ficheMini;
  return Math.min(r.ficheMaxi, Math.max(r.ficheMini, r.ficheBase + bande * r.fichePart));
}

export type BesoinCadrage = {
  /** Largeur de la bande laissée libre par les colonnes, en pixels. */
  bande: number;
  /** Demi-largeur apparente de la planète, anneaux compris, en pixels. */
  demiPlanete: number;
  /** Largeur souhaitée de la fiche, en pixels. */
  largeurVoulue?: number;
  /** En deçà, la fiche ne dirait plus rien : mieux vaut la laisser déborder. */
  largeurMini?: number;
};

export type PlaceFiche = {
  /** Largeur à donner à la fiche. */
  largeur: number;
  /** Décalage latéral du point visé, en pixels d'écran. */
  decalage: number;
  /** La fiche tient-elle sans toucher la planète ? */
  degagee: boolean;
};

/**
 * Décide ensemble la largeur de la fiche et le décalage de la planète.
 *
 * Les deux se répondent, les traiter séparément ne menait nulle part.
 *
 * La caméra centre ce qu'elle vise : une planète centrée ne laisse de chaque
 * côté que la moitié de la bande moins son propre rayon apparent — souvent
 * moins qu'il n'en faut pour la fiche. On pousse donc la planète sur le côté ;
 * et si cela ne suffit toujours pas, on rétrécit la fiche plutôt que de la
 * poser dessus.
 *
 * Le rayon apparent inclut les anneaux : ils portent jusqu'à près de quatre
 * rayons, et les ignorer revenait à dimensionner sur le quart de l'objet.
 */
export function composerFiche(b: BesoinCadrage): PlaceFiche {
  const voulue = b.largeurVoulue ?? largeurFicheVoulue(b.bande);
  const mini = Math.min(b.largeurMini ?? lireReglages().ficheMini, voulue);
  const demiBande = b.bande / 2;

  // Place restante quand la planète est poussée au maximum sur le côté, son
  // bord affleurant la marge.
  const dispo = b.bande - 2 * MARGE - ECART - 2 * b.demiPlanete;
  const largeur = Math.max(mini, Math.min(voulue, dispo));

  const requis = b.demiPlanete + ECART + largeur + MARGE;
  const manque = Math.max(0, requis - demiBande);
  // Jamais au point de sortir la planète de la bande : on gagnerait de la place
  // en perdant le sujet de la vue.
  const maxi = Math.max(0, demiBande - b.demiPlanete - MARGE);
  const decalage = Math.min(manque, maxi);

  return {
    largeur,
    decalage,
    degagee: decalage >= manque - 1e-9 && dispo >= mini,
  };
}

/**
 * Convertit un décalage en pixels d'écran en unités du monde, à la distance
 * donnée. Perspective verticale : c'est la hauteur qui fixe l'échelle.
 */
export function pixelsEnMonde(
  pixels: number,
  distance: number,
  hauteurEcran: number,
  fovDegres: number,
): number {
  if (hauteurEcran <= 0) return 0;
  const hauteurMonde = 2 * distance * Math.tan((fovDegres / 2) * (Math.PI / 180));
  return (pixels / hauteurEcran) * hauteurMonde;
}

/**
 * Demi-largeur apparente d'une sphère de rayon `rayon` vue de `distance`.
 * Approximation par projection du rayon, suffisante ici : on dimensionne un
 * espace, on ne détoure pas la planète.
 */
export function demiLargeurApparente(
  rayon: number,
  distance: number,
  hauteurEcran: number,
  fovDegres: number,
): number {
  if (distance <= 0 || hauteurEcran <= 0) return 0;
  const hauteurMonde = 2 * distance * Math.tan((fovDegres / 2) * (Math.PI / 180));
  return (rayon / hauteurMonde) * hauteurEcran;
}

export type Vec3 = { x: number; y: number; z: number };

/**
 * Position de caméra et point visé pour observer une planète.
 *
 * `direction` est le vecteur unitaire qui va de la planète vers la caméra, et
 * `lateral` le déplacement latéral qui décentre la planète pour laisser place à
 * la fiche. **Les deux points subissent le même décalage** : la caméra se
 * déplace parallèlement au lieu de regarder de biais, et la distance qui les
 * sépare reste exactement `distance`.
 *
 * C'est cette invariante qui a manqué une fois, faute d'un vecteur temporaire :
 * la position calculée valait deux fois le seul décalage latéral, soit quelques
 * unités du centre de la galaxie — la caméra se retrouvait à l'intérieur d'un
 * soleil, et l'écran devenait un aplat orange.
 */
export function poserCamera(
  planete: Vec3,
  direction: Vec3,
  distance: number,
  lateral: Vec3 = { x: 0, y: 0, z: 0 },
): { position: Vec3; cible: Vec3 } {
  const cible = {
    x: planete.x + lateral.x,
    y: planete.y + lateral.y,
    z: planete.z + lateral.z,
  };
  return {
    position: {
      x: cible.x + direction.x * distance,
      y: cible.y + direction.y * distance,
      z: cible.z + direction.z * distance,
    },
    cible,
  };
}

/**
 * Distance d'approche d'une planète, choisie pour que sa fiche tienne à côté.
 *
 * Une distance fixe, en multiples du rayon, ne pouvait pas convenir : elle
 * ignore la largeur de la bande, qui est ce qui manque. Un multiple qui va bien
 * sur une fenêtre large remplit toute la bande sur une fenêtre étroite — et la
 * fiche n'a plus où se poser.
 *
 * On part donc de la place à laisser : la planète doit occuper au plus ce que
 * la bande offre une fois la fiche et ses marges retranchées, et la distance
 * s'en déduit. Les bornes évitent les deux excès — se coller à la planète sur
 * une bande immense, s'en éloigner au point de la perdre sur une bande étroite.
 */
export function distanceApproche(
  rayonVisuel: number,
  bande: number,
  hauteurEcran: number,
  fovDegres: number,
  largeurVoulue?: number,
): number {
  const voulue = largeurVoulue ?? largeurFicheVoulue(bande);
  const reglages = lireReglages();
  const mini = rayonVisuel * reglages.camReculMin;
  // Vingt rayons et non quatorze : sur une bande étroite, quatorze ne
  // permettaient pas de reculer assez pour dégager la fiche — il manquait une
  // douzaine de pixels, et la carte se reposait sur la planète. À cette
  // distance elle occupe encore une cinquantaine de pixels : on la voit.
  const maxi = rayonVisuel * reglages.camReculMax;
  if (bande <= 0 || hauteurEcran <= 0) return rayonVisuel * 5;

  // Demi-largeur que la planète peut occuper sans chasser la fiche.
  const demiVoulue = Math.max(30, (bande - 2 * MARGE - ECART - voulue) / 2);
  const t = Math.tan((fovDegres / 2) * (Math.PI / 180));
  const d = (rayonVisuel * hauteurEcran) / (2 * demiVoulue * t);

  return Math.min(maxi, Math.max(mini, d));
}
