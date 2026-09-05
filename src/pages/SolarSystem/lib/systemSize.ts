import { MathUtils } from 'three';
import { ORB_BASE, ORB_STEP, PLN_R_MAX } from '../constants';
import { orbitRadius } from './orbits';

/**
 * Étendue de la couronne solaire, en rayons du soleil, et plafond de cette
 * étendue rapporté au système — les deux doivent refléter `createSun`.
 */
const CORONA_SPAN = 3.4;
const CORONA_CAP = 0.42;

/**
 * Écart minimal entre la couronne et la première planète, en multiples de
 * l'étendue de la couronne.
 *
 * Généreux à dessein : à 1,18 la planète frôlait encore le halo, et la
 * floraison lumineuse ajoutée depuis élargit le soleil au-delà de sa géométrie.
 */
const SUN_GAP = 1.9;

export type TailleSysteme = {
  /** Rayon de la première orbite, dégageant la couronne solaire. */
  orbBase: number;
  /** Écart entre deux orbites successives. */
  orbStep: number;
  /** Rayon de l'orbite la plus externe. */
  outerR: number;
  /** Rayon du soleil. */
  sunR: number;
  /** Rayon encombré, ceinture d'astéroïdes comprise. */
  systemR: number;
};

/**
 * Dimensionne un système à partir du seul nombre de jeux.
 *
 * Extrait de la scène parce que la galaxie en contient désormais plusieurs :
 * chacun doit connaître son encombrement avant même d'exister, pour qu'on
 * puisse les disposer sans qu'ils se chevauchent.
 *
 * Dimensionnement par point fixe. Trois grandeurs se déterminent mutuellement :
 * le rayon du soleil se déduit de l'étendue du système, l'étendue de sa
 * couronne est plafonnée par cette même étendue, et la première orbite doit
 * dégager la couronne — ce qui repousse l'étendue. On itère donc jusqu'à
 * stabilisation. Trois passes suffisent : chacune ne fait que croître, et la
 * borne supérieure du soleil (26) arrête la progression.
 */
export function dimensionnerSysteme(nbJeux: number): TailleSysteme {
  // Les orbites s'écartent assez pour que la plus grosse planète possible ne
  // touche jamais sa voisine.
  const orbStep = Math.max(ORB_STEP, PLN_R_MAX * 2.3);

  const rayonSoleil = (portee: number) =>
    MathUtils.clamp(portee * 0.055, PLN_R_MAX * 1.3, 26);
  const porteeDe = (base: number) =>
    (nbJeux > 0 ? orbitRadius(nbJeux - 1, orbStep, base) : base);
  /** Étendue réelle de la couronne, cap de `createSun` compris. */
  const couronneDe = (portee: number) =>
    Math.min(rayonSoleil(portee) * CORONA_SPAN, portee * CORONA_CAP);

  let orbBase = ORB_BASE;
  for (let i = 0; i < 3; i += 1) {
    // Le dégagement se compte jusqu'au **bord** de la planète la plus proche,
    // pas jusqu'à son centre : c'est sa surface qu'on voit entrer dans le
    // soleil.
    orbBase = Math.max(ORB_BASE, couronneDe(porteeDe(orbBase)) * SUN_GAP + PLN_R_MAX);
  }

  const outerR = porteeDe(orbBase);
  // Le plancher garantit que le soleil reste plus gros que toute planète.
  const sunR = rayonSoleil(outerR);
  // Assez large pour englober la ceinture d'astéroïdes.
  const systemR = outerR * 1.55 + sunR * 2;

  return { orbBase, orbStep, outerR, sunR, systemR };
}
